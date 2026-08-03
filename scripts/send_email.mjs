import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { connect } from "net";
import { connect as tlsConnect } from "tls";
import { randomBytes } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── SMTP Client (zero dependency, Node built-ins only) ───

class SmtpClient {
  constructor(config) {
    this.config = config;
    this.socket = null;
    this.buffer = "";
  }

  async connect() {
    const { host, port, secure } = this.config.smtp;
    return new Promise((resolve, reject) => {
      const onError = (err) => reject(new Error("connect failed: " + err.message));
      if (secure) {
        this.socket = tlsConnect({ host, port, rejectUnauthorized: false }, () => {
          this.socket.removeListener("error", onError);
          resolve();
        });
      } else {
        this.socket = connect({ host, port }, () => resolve());
      }
      this.socket.once("error", onError);
      this.socket.setEncoding("utf-8");
    });
  }

  async readResponse() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("SMTP timeout")), 15000);
      const onData = (data) => {
        this.buffer += data;
        const lines = this.buffer.split("\r\n");
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          const code = parseInt(line.substring(0, 3));
          if (line[3] === " ") {
            this.buffer = lines.slice(i + 1).join("\r\n");
            this.socket.removeListener("data", onData);
            clearTimeout(timeout);
            if (code >= 400) {
              reject(new Error("SMTP " + code + ": " + line.substring(4)));
            } else {
              resolve({ code, message: line.substring(4) });
            }
            return;
          }
        }
      };
      this.socket.on("data", onData);
    });
  }

  async sendCommand(cmd) {
    this.socket.write(cmd + "\r\n");
    return this.readResponse();
  }

  async login() {
    const { user, pass } = this.config.smtp.auth;
    await this.readResponse();
    await this.sendCommand("EHLO localhost");
    await this.sendCommand("AUTH LOGIN");
    await this.sendCommand(Buffer.from(user).toString("base64"));
    await this.sendCommand(Buffer.from(pass).toString("base64"));
  }

  async sendMail(from, to, subject, textBody, htmlBody) {
    const boundary = "====bnd_" + Date.now() + "_" + randomBytes(6).toString("hex") + "====";
    const msgId = "<" + Date.now() + "." + randomBytes(6).toString("hex") + "@quantum-daily>";

    const extractEmail = (addr) => {
      const m = addr.match(/<([^>]+)>/);
      return m ? m[1] : addr;
    };

    const b64wrap = (str, len) => {
      const b = Buffer.from(str, "utf-8").toString("base64");
      const lines = [];
      for (let i = 0; i < b.length; i += len) lines.push(b.substring(i, i + len));
      return lines;
    };

    const headers = [
      "From: " + from, "To: " + to,
      "Subject: =?UTF-8?B?" + Buffer.from(subject).toString("base64") + "?=",
      "Message-ID: " + msgId, "Date: " + new Date().toUTCString(),
      "MIME-Version: 1.0",
      'Content-Type: multipart/alternative; boundary="' + boundary + '"',
      "", "--" + boundary,
      "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
      ...b64wrap(textBody, 76),
      "--" + boundary,
      "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
      ...b64wrap(htmlBody, 76),
      "--" + boundary + "--", ".",
    ].join("\r\n");

    await this.sendCommand("MAIL FROM:<" + extractEmail(from) + ">");
    await this.sendCommand("RCPT TO:<" + extractEmail(to) + ">");
    await this.sendCommand("DATA");
    this.socket.write(headers + "\r\n");
    await this.readResponse();
  }

  async quit() {
    try { await this.sendCommand("QUIT"); } catch(e) {}
    this.socket.destroy();
  }

  async close() {
    this.socket.destroy();
  }
}

// ─── Markdown to HTML Converter ───

export function markdownToHtml(md) {
  let html = md
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="border-bottom:2px solid #2563eb;padding-bottom:4px;color:#1e3a5f;">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="color:#1e3a5f;">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#2563eb;">$1</a>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #2563eb;padding:8px 16px;margin:8px 0;background:#f0f4ff;">$1</blockquote>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">')
    .replace(/- (.+)$/gm, '<li style="margin:4px 0;">$1</li>')
    .replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:0.9em;">$1</code>')
    .replace(/\n\n/g, '</p><p style="margin:8px 0;line-height:1.7;">')
    .replace(/\n/g, '<br>');

  html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, '<ul style="padding-left:20px;">$1</ul>');

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><style>\n'
    + 'body{font-family:-apple-system,"Microsoft YaHei",sans-serif;max-width:700px;margin:0 auto;padding:16px;color:#1f2937;font-size:15px;}\n'
    + 'blockquote p{margin:0;}\n'
    + '</style></head><body><p style="margin:8px 0;line-height:1.7;">' + html + '</p></body></html>';
}

// ─── Main: send report via email ───


// ??? Error notification ??????????????????????????????????????????

export async function sendErrorNotification(errorMsg) {
  const configPath = resolve(__dirname, "..", "config", "email.json");
  if (!existsSync(configPath)) {
    console.error("Cannot send error notification: config not found");
    return { success: false, error: "config not found" };
  }
  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  if (config.smtp.host === "smtp.example.com") {
    console.error("Cannot send error notification: SMTP not configured");
    return { success: false, error: "SMTP not configured" };
  }

  const client = new SmtpClient(config);
  try {
    await client.connect();
    await client.login();
    const subject = (config.subject_prefix || "[Daily Report]") + " ERROR: Pipeline failure";
    const body = `The quantum optics daily report pipeline encountered an error at ${new Date().toISOString()}:

${errorMsg}

Please check the automation logs.`;
    const html = `<html><body><h2>Pipeline Error</h2><p>${errorMsg.replace(/
/g, "<br>")}</p><p><em>${new Date().toISOString()}</em></p></body></html>`;
    await client.sendMail(config.from, config.to, subject, body, html);
    await client.quit();
    return { success: true };
  } catch (err) {
    await client.close();
    console.error("Failed to send error notification:", err.message);
    return { success: false, error: err.message };
  }
}

export async function sendReportEmail(reportPath) {
  const configPath = resolve(__dirname, "..", "config", "email.json");
  if (!existsSync(configPath)) {
    throw new Error("config/email.json not found: " + configPath);
  }
  const config = JSON.parse(readFileSync(configPath, "utf-8"));

  if (config.smtp.host === "smtp.example.com") {
    throw new Error("Please edit config/email.json with real SMTP credentials");
  }

  if (!existsSync(reportPath)) {
    throw new Error("Report not found: " + reportPath);
  }
  const markdown = readFileSync(reportPath, "utf-8");

  const dateMatch = markdown.match(/\*\*日期\*\*[：:]\s*(.+)/);
  const dateStr = dateMatch ? dateMatch[1].trim() : "";

  const client = new SmtpClient(config);
  try {
    await client.connect();
    await client.login();
    await client.sendMail(
      config.from, config.to,
      (config.subject_prefix || "[Daily Report]") + " " + dateStr,
      markdown, markdownToHtml(markdown)
    );
    await client.quit();
    return { success: true, date: dateStr };
  } catch (err) {
    await client.close();
    throw err;
  }
}
