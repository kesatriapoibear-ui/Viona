import puppeteer from "puppeteer-extra"
import StealthPlugin from "puppeteer-extra-plugin-stealth"

puppeteer.use(StealthPlugin())

const VALID_MODELS = [
  "r1-1776",
  "sonar-pro",
  "sonar",
  "sonar-reasoning-pro",
  "sonar-reasoning",
]

async function askPerplexity(text, model = "r1-1776") {
  if (!VALID_MODELS.includes(model)) {
    throw new Error(`Model tidak valid: ${model}. Pilihan: ${VALID_MODELS.join(", ")}`)
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  const page = await browser.newPage()
  const client = await page.target().createCDPSession()
  await client.send("Network.enable")

  let lastMessageTime = Date.now()
  const TIMEOUT = 30000

  const timeoutChecker = setInterval(async () => {
    if (Date.now() - lastMessageTime > TIMEOUT) {
      clearInterval(timeoutChecker)
      await browser.close()
      throw new Error("Timeout: Tidak ada pesan final dalam 30 detik.")
    }
  }, 5000)

  return new Promise(async (resolve, reject) => {
    client.on("Network.webSocketFrameReceived", async ({ response }) => {
      try {
        const payload = response.payloadData
        if (payload.startsWith("42")) {
          const [, jsonString] = payload.match(/^42(.+)$/) || []
          if (!jsonString) return

          const [eventName, eventData] = JSON.parse(jsonString)
          lastMessageTime = Date.now()

          if (
            typeof eventData === "object" &&
            eventData.final === true &&
            eventData.status === "completed"
          ) {
            clearInterval(timeoutChecker)
            await browser.close()
            resolve(eventData)
          }
        }
      } catch (err) {
        clearInterval(timeoutChecker)
        await browser.close()
        reject(err)
      }
    })

    try {
      await page.goto("https://playground.perplexity.ai/", { waitUntil: "networkidle2" })
      await page.waitForSelector("select#lamma-select")
      await page.select("select#lamma-select", model)

      await page.waitForSelector('textarea[placeholder="Ask anything…"]')
      await page.type('textarea[placeholder="Ask anything…"]', text)

      await page.waitForFunction(() => {
        const btn = document.querySelector('button[aria-label="Submit"]')
        return btn && !btn.disabled
      })

      await page.click('button[aria-label="Submit"]')
    } catch (err) {
      clearInterval(timeoutChecker)
      await browser.close()
      reject(err)
    }
  })
}

export const perplexityRoute = (app) => {
  app.get("/api/ai/perplexity", async (req, res) => {
    const { text, model = "r1-1776" } = req.query || {}

    if (!text) return res.status(400).json({ status: false, error: "Parameter 'text' wajib diisi" })
    if (typeof text !== "string" || !text.trim()) return res.status(400).json({ status: false, error: "Text tidak valid" })
    if (model && !VALID_MODELS.includes(model)) return res.status(400).json({ status: false, error: `Model tidak valid: ${model}` })

    try {
      const result = await askPerplexity(text.trim(), model)
      res.json({ status: true, data: result, timestamp: new Date().toISOString() })
    } catch (err) {
      res.status(500).json({ status: false, error: err.message })
    }
  })

  app.post("/api/ai/perplexity", async (req, res) => {
    const { text, model = "r1-1776" } = req.body || {}

    if (!text) return res.status(400).json({ status: false, error: "Parameter 'text' wajib diisi" })
    if (typeof text !== "string" || !text.trim()) return res.status(400).json({ status: false, error: "Text tidak valid" })
    if (model && !VALID_MODELS.includes(model)) return res.status(400).json({ status: false, error: `Model tidak valid: ${model}` })

    try {
      const result = await askPerplexity(text.trim(), model)
      res.json({ status: true, data: result, timestamp: new Date().toISOString() })
    } catch (err) {
      res.status(500).json({ status: false, error: err.message })
    }
  })
}