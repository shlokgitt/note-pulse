const functions = require("firebase-functions");
const fetch = require("node-fetch");

exports.callClaude = functions.https.onCall(async (data, context) => {

  const apiKey = "sk-ant-YOUR-NEW-KEY-HERE"; // ✅ safe — this runs on server, not browser

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: data.messages,
    }),
  });

  const result = await response.json();
  return result;
});
