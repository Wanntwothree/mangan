const net = require("node:net");
const tls = require("node:tls");

const smtpTimeout = 20_000;

function expectCode(lines, expected) {
  const last = lines[lines.length - 1] || "";
  const code = Number(last.slice(0, 3));
  if (code !== expected) throw new Error(`SMTP command failed: ${last}`);
  return lines;
}

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value), "utf8").toString("base64")}?=`;
}

function buildMessage({ from, name, to, subject, text }) {
  const body = String(text).replace(/\r?\n/g, "\r\n");
  return [
    `From: ${name ? `${encodeHeader(name)} <${from}>` : from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
    "."
  ].join("\r\n") + "\r\n";
}

class SmtpConnection {
  constructor(socket) {
    this.attach(socket);
  }

  attach(socket) {
    this.socket = socket;
    this.buffer = "";
    this.waiter = null;
    this.onData = (chunk) => {
      this.buffer += chunk.toString("utf8");
      this.flush();
    };
    this.onError = (error) => {
      if (!this.waiter) return;
      const waiter = this.waiter;
      this.waiter = null;
      clearTimeout(waiter.timer);
      waiter.reject(error);
    };
    socket.on("data", this.onData);
    socket.on("error", this.onError);
  }

  detach() {
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      clearTimeout(waiter.timer);
      waiter.reject(new Error("SMTP connection was interrupted."));
    }
    this.socket.off("data", this.onData);
    this.socket.off("error", this.onError);
    this.buffer = "";
  }

  flush() {
    if (!this.waiter) return;
    const parts = this.buffer.split("\r\n");
    const complete = parts.slice(0, -1);
    const finalIndex = complete.findIndex((line) => /^\d{3}(?: |$)/.test(line));
    if (finalIndex < 0) return;
    const lines = complete.slice(0, finalIndex + 1);
    this.buffer = parts.slice(finalIndex + 1).join("\r\n");
    const waiter = this.waiter;
    this.waiter = null;
    clearTimeout(waiter.timer);
    waiter.resolve(lines);
  }

  wait(raw) {
    return new Promise((resolve, reject) => {
      if (this.waiter) return reject(new Error("An SMTP command is already in flight."));
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        if (this.waiter !== waiter) return;
        this.waiter = null;
        reject(new Error("SMTP response timed out."));
      }, smtpTimeout);
      this.waiter = waiter;
      if (raw) this.socket.write(raw, (error) => {
        if (error && this.waiter === waiter) {
          this.waiter = null;
          clearTimeout(waiter.timer);
          reject(error);
        }
      });
      this.flush();
    });
  }

  read() {
    return this.wait(null);
  }

  command(line) {
    return this.wait(`${line}\r\n`);
  }

  write(raw) {
    return this.wait(raw);
  }
}

function openSocket({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ host, port, servername: host })
      : net.connect({ host, port });
    const onSecure = () => {
      cleanup();
      resolve(socket);
    };
    const onError = (error) => {
      cleanup();
      socket.destroy();
      reject(error);
    };
    const cleanup = () => {
      socket.off(secure ? "secureConnect" : "connect", onSecure);
      socket.off("error", onError);
    };
    socket.once(secure ? "secureConnect" : "connect", onSecure);
    socket.once("error", onError);
  });
}

function upgradeToTls(socket, host) {
  return new Promise((resolve, reject) => {
    const secured = tls.connect({ socket, servername: host });
    secured.once("secureConnect", () => resolve(secured));
    secured.once("error", (error) => {
      secured.destroy();
      reject(error);
    });
  });
}

async function sendMail({ host, port, secure, user, password, from, name, to, subject, text }) {
  let socket = await openSocket({ host, port, secure });
  let connection = new SmtpConnection(socket);
  try {
    expectCode(await connection.read(), 220);

    let response = await connection.command("EHLO localhost");
    expectCode(response, 250);

    if (!secure && response.some((line) => /^250[- ]STARTTLS\b/i.test(line))) {
      response = await connection.command("STARTTLS");
      expectCode(response, 220);
      connection.detach();
      socket = await upgradeToTls(socket, host);
      connection = new SmtpConnection(socket);
      expectCode(await connection.command("EHLO localhost"), 250);
    }

    expectCode(await connection.command("AUTH LOGIN"), 334);
    expectCode(await connection.command(Buffer.from(user, "utf8").toString("base64")), 334);
    expectCode(await connection.command(Buffer.from(password, "utf8").toString("base64")), 235);

    expectCode(await connection.command(`MAIL FROM:<${from}>`), 250);
    expectCode(await connection.command(`RCPT TO:<${to}>`), 250);
    expectCode(await connection.command("DATA"), 354);
    expectCode(await connection.write(buildMessage({ from, name, to, subject, text })), 250);
    await connection.command("QUIT");
  } finally {
    connection.detach();
    socket.destroy();
  }
}

function createSmtpMailer(options = {}) {
  const host = options.host || "smtp.gmail.com";
  const port = Number(options.port) || 465;
  const user = options.user || "";
  const password = options.password || "";
  const from = options.from || user;
  const name = options.name || "MANGAN";
  const secure = options.secure ?? port === 465;
  const configured = Boolean(host && user && password && from);

  return {
    isConfigured() {
      return configured;
    },
    async sendPasswordResetCode({ to, code }) {
      if (!configured) throw new Error("Email delivery is not configured.");
      await sendMail({
        host,
        port,
        secure,
        user,
        password,
        from,
        name,
        to,
        subject: "Your MANGAN password reset code",
        text: [
          "Hi,",
          "",
          `Your MANGAN password reset code is ${code}.`,
          "It expires in 10 minutes. If you did not request a password reset, you can ignore this email.",
          "",
          "— MANGAN"
        ].join("\n")
      });
    }
  };
}

function createMailerFromEnvironment() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER || process.env.GMAIL_USER || "";
  const password = process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD || "";
  const from = process.env.MAIL_FROM || user;
  const name = process.env.MAIL_FROM_NAME || "MANGAN";
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.toLowerCase() === "true"
    : port === 465;
  return createSmtpMailer({ host, port, secure, user, password, from, name });
}

module.exports = { createSmtpMailer, createMailerFromEnvironment, buildMessage };
