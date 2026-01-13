import "dotenv/config";
import { Telegraf } from "telegraf";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN;
const AI_URL = process.env.AI_URL ?? "https://spiralai.duckdns.org/api/v1/ai/chat";

if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is missing in .env");
if (!INTERNAL_TOKEN) console.warn("⚠️ INTERNAL_TOKEN is missing (X-Internal-Token). Add it to .env");

const bot = new Telegraf(BOT_TOKEN);

async function callAi(prompt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": INTERNAL_TOKEN ?? ""
      },
      body: JSON.stringify({ prompt }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const raw = await res.text();

    if (!res.ok) {
      throw new Error(`AI API error ${res.status}: ${raw}`);
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`AI API returned non-JSON: ${raw}`);
    }

    const text = data?.text;
    if (typeof text !== "string") {
      throw new Error(`AI API JSON has no "text": ${raw}`);
    }

    return { text, usage: data?.usage };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("Таймаут подключения к API (30 сек)");
    }
    if (error.cause?.code === "UND_ERR_CONNECT_TIMEOUT") {
      throw new Error("Не удалось подключиться к API. Проверьте доступность сервера.");
    }
    throw error;
  }
}

bot.start((ctx) =>
  ctx.reply("Привет. Напиши сообщение — я отправлю его в spiralai и верну ответ.")
);

bot.on("text", async (ctx) => {
  const prompt = ctx.message.text?.trim();
  if (!prompt) return;

  try {
    await ctx.sendChatAction("typing");

    const { text } = await callAi(prompt);
    await ctx.reply(text);
  } catch (e) {
    console.error("Error:", e);
    const errorMessage = e.message || "Неизвестная ошибка";
    await ctx.reply(`❌ Ошибка: ${errorMessage}`);
  }
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

bot.launch().then(() => console.log("✅ Bot started"));
