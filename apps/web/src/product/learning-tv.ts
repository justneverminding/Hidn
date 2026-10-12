import * as THREE from "three";

/** The Library's learning television: channels of short slides paraphrased
 * from ZecHub's "Start Here" wiki (zechub.wiki/start-here). Shown on a CRT
 * in the room and in an in-room viewer, so learning never leaves HIDN. */

export interface TvSlide {
  heading: string;
  body: string;
  /** Longer explanation, revealed by scrolling inside the screen. */
  detail?: string;
  link?: { href: string; label: string };
}

export interface TvChannel {
  number: string;
  title: string;
  /** Overrides TV_SOURCE for channels drawn from another ZecHub page. */
  source?: string;
  slides: TvSlide[];
}

export const TV_SOURCE = "SOURCE: ZECHUB.WIKI / START HERE";

export const TV_CHANNELS: TvChannel[] = [
  { number: "01", title: "ZCASH BASICS", slides: [
    { heading: "WHAT IS ZEC?", body: "ZEC is a privacy-first digital currency built on the Zcash blockchain.", detail: "It is the closest thing to cash on the web. It shares much with Bitcoin, but adds fully private payments, fixing what ZecHub calls Bitcoin's biggest flaw." },
    { heading: "PRIVATE BY PROOF", body: "Shielded payments use zero-knowledge proofs: the network confirms a payment is valid without seeing who sent it, who received it, or how much.", detail: "Zcash implements the Zerocash protocol: an open, blockchain-based ledger with a zero-knowledge proving system that keeps transaction metadata confidential." },
    { heading: "YOUR CHOICE", body: "You decide what to reveal about your money, and to whom.", detail: "A peer-to-peer, permissionless money lets people store value and transact without central gatekeepers, and disclose their finances only when they choose." },
    { heading: "OPEN BY DESIGN", body: "Zcash is open-source, permissionless and decentralized.", detail: "As tools that analyse blockchains spread, pseudonymous payments are no longer enough protection. Zcash was built from Bitcoin's code to raise the standard of privacy." },
  ] },
  { number: "02", title: "WHO CAN SEE A PAYMENT", slides: [
    { heading: "TWO KINDS OF ADDRESS", body: "Transparent addresses start with t. Shielded addresses start with z or u.", detail: "Every payment moves between two addresses, and each can be transparent or shielded. That makes four paths, and each one reveals a different amount." },
    { heading: "WHAT GOES PUBLIC", body: "Whatever touches a transparent address becomes public.", detail: "Transparent activity works like Bitcoin: anyone can read it on a block explorer, and it stays readable for as long as the chain exists." },
    { heading: "FULLY PRIVATE", body: "Only a shielded-to-shielded payment hides the sender, the recipient and the amount. The fee is still public.", detail: "Inside the shielded pool the addresses, the amount and the memo are encrypted. Observers can see only that a transaction happened and that a fee was paid." },
    { heading: "SHIELD ON ARRIVAL", body: "Many exchanges only withdraw to transparent addresses. Shield your ZEC as soon as it arrives, before you spend it.", detail: "Public is permanent: a payment cannot be shielded after it was sent. Pay to shielded addresses whenever the receiver supports one." },
  ] },
  { number: "03", title: "YOUR KEYS", slides: [
    { heading: "SPENDING KEY", body: "It sees everything and moves funds. It stays with you and is never shared.", detail: "Treat it like the money itself: anyone who holds it can move your funds." },
    { heading: "FULL VIEWING KEY", body: "Read-only: incoming and outgoing activity and balances. It cannot spend a single zatoshi.", detail: "This is the key to hand an auditor, an accountant or a tax office when you need to prove something without giving up control." },
    { heading: "INCOMING VIEWING KEY", body: "Narrower still: it only shows payments arriving.", detail: "An exchange or a merchant can run it to confirm a deposit landed, while the spending key stays on hardware that never touches the internet." },
    { heading: "NO UNDO", body: "A viewing key cannot be revoked. Share the narrowest key that answers the question.", detail: "Once someone has a viewing key they can read that address for as long as it exists. To cut access off, move your funds to a new address." },
  ] },
  { number: "04", title: "FIRST STEPS", slides: [
    { heading: "1 / GET SOME ZEC", body: "Buy ZEC on an exchange. You do not need a whole coin; fractions are fine.", detail: "ZEC is divisible, so you can start small. ZecHub keeps a list of exchanges, including ones that support shielded withdrawals." },
    { heading: "2 / SET UP A WALLET", body: "Use a shielded wallet such as Zodl or Vizor.", detail: "Shielded wallets carry the privacy features that make ZEC unique. Channel 08 has download links for both." },
    { heading: "3 / WITHDRAW", body: "Move your ZEC from the exchange into your shielded wallet.", detail: "If the exchange only sends to a transparent address, shield the funds yourself once they arrive." },
    { heading: "4 / SEND PRIVATELY", body: "Send your first shielded transaction: a private payment on Zcash.", detail: "A shielded transaction protects each participant: sender, receiver and amount stay encrypted." },
    { heading: "5 / SAY HELLO", body: "The Zcash Community Forum and Discord welcome newcomers. Questions are always fine.", detail: "Conversations can get technical, but the community is welcoming. If you have a question, ask." },
  ] },
  { number: "05", title: "THE MONEY", slides: [
    { heading: "21 MILLION", body: "Like Bitcoin, Zcash has a fixed supply of 21 million ZEC.", detail: "Once the last ZEC is mined into circulation, the supply stops growing." },
    { heading: "EVERY 75 SECONDS", body: "A new block is mined about every 75 seconds. Its reward of 1.5625 ZEC goes to miners and the development fund.", detail: "New coins enter circulation only through these block rewards." },
    { heading: "HALVINGS", body: "The block reward halves about every four years until all 21 million ZEC are in circulation.", detail: "Zcash inflation closely mirrors Bitcoin's: it falls as new coins are created, and drops sharply at each halving." },
  ] },
  { number: "06", title: "NETWORK UPGRADES", slides: [
    { heading: "SPROUT / 2016", body: "The launch: the first shielded pool and zk-SNARK private transactions.", detail: "Activated at genesis on October 28, 2016." },
    { heading: "SAPLING / 2018", body: "Efficient shielded transactions, fast enough for phones and hardware wallets.", detail: "Activated October 29, 2018, at block 419,200. Overwinter came just before it, adding replay protection and transaction expiry." },
    { heading: "NU5 / 2022", body: "The Orchard pool on Halo 2, with no trusted setup, plus unified addresses.", detail: "Activated May 31, 2022, at block 1,687,104. Halo 2 removed the need for a trusted setup ceremony." },
    { heading: "IRONWOOD / 2026", body: "The Ironwood pool, and a public turnstile that lets anyone audit the supply.", detail: "Ironwood (NU6.3) activated July 28, 2026, at block 3,428,143. The next upgrade, NU7, plans 25-second blocks; its dates are still tentative." },
  ] },
  { number: "07", title: "MEMOS AND USES", slides: [
    { heading: "PAYMENTS", body: "Shielded payments stay confidential, while you can still choose to share details when needed.", detail: "Private Z-to-Z transactions still appear on the chain, so it is known that they happened and fees were paid, but the addresses, amount and memo are encrypted." },
    { heading: "STORE OF VALUE", body: "A hard, privacy-protecting asset with a fixed supply.", detail: "There will only ever be 21 million ZEC, so the supply cannot be inflated by a central gatekeeper." },
    { heading: "MESSAGES", body: "The memo field of a shielded payment carries a fully encrypted message, for the cost of a tiny fee.", detail: "To send a memo you make a transaction and pay its fee, which is less than one cent." },
  ] },
  { number: "08", title: "GET A WALLET", source: "SOURCE: ZECHUB.WIKI / WALLETS", slides: [
    { heading: "ZODL", body: "A shielded mobile wallet, formerly Zashi, ready for the Ironwood upgrade.", detail: "Holds transparent, Sapling and Ironwood funds, and shields by default.", link: { href: "https://zodl.com", label: "DOWNLOAD ZODL" } },
    { heading: "VIZOR", body: "A shielded wallet for desktop and mobile, ready for the Ironwood upgrade.", detail: "Holds transparent, Sapling and Ironwood funds.", link: { href: "https://vizor.cash/", label: "DOWNLOAD VIZOR" } },
    { heading: "COMPARE THEM ALL", body: "ZecHub compares every Zcash wallet by platform and features.", link: { href: "https://zechub.wiki/wallets", label: "OPEN ZECHUB WALLETS" } },
  ] },
];

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Paints one slide onto a CRT screen canvas (4:3). */
export function paintTvSlide(ctx: CanvasRenderingContext2D, channel: number, slide: number): void {
  const { width: w, height: h } = ctx.canvas;
  const ch = TV_CHANNELS[channel % TV_CHANNELS.length];
  const s = ch.slides[slide % ch.slides.length];
  ctx.fillStyle = "#031408";
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * .7);
  glow.addColorStop(0, "rgba(77, 255, 110, .16)");
  glow.addColorStop(1, "rgba(0, 0, 0, .6)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#7dff9a";
  ctx.font = "600 22px monospace";
  ctx.fillText(`CH ${ch.number}`, 34, 48);
  ctx.textAlign = "right";
  ctx.fillText(ch.title, w - 34, 48);
  ctx.textAlign = "left";
  ctx.fillRect(34, 62, w - 68, 2);
  ctx.font = "700 44px monospace";
  ctx.fillStyle = "#b9f7c4";
  ctx.fillText(s.heading, 34, 140);
  ctx.font = "28px monospace";
  ctx.fillStyle = "#7dff9a";
  wrap(ctx, s.body, w - 68).slice(0, 7).forEach((line, i) => ctx.fillText(line, 34, 200 + i * 40));
  ctx.font = "16px monospace";
  ctx.fillStyle = "rgba(125, 255, 154, .6)";
  ctx.fillText(`${ch.source ?? TV_SOURCE}   ${String(slide % ch.slides.length + 1).padStart(2, "0")}/${String(ch.slides.length).padStart(2, "0")}`, 34, h - 30);
  ctx.fillStyle = "rgba(0, 0, 0, .28)";
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
}

/** A live CRT texture that cycles through the channels in the room. */
export function liveTvTexture(): { texture: THREE.CanvasTexture; advance: () => void } {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext("2d")!;
  let channel = 0, slide = 0;
  paintTvSlide(ctx, channel, slide);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return {
    texture,
    advance: () => {
      slide++;
      if (slide >= TV_CHANNELS[channel].slides.length) { slide = 0; channel = (channel + 1) % TV_CHANNELS.length; }
      paintTvSlide(ctx, channel, slide);
      texture.needsUpdate = true;
    },
  };
}

/** Static terminal or snow textures for the surrounding sets. */
export function idleTvTexture(seed: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#031408";
  ctx.fillRect(0, 0, 320, 240);
  let s = seed * 9301 + 49297;
  const rand = (): number => ((s = (s * 9301 + 49297) % 233280) / 233280);
  if (seed % 3 === 0) {
    // Snow.
    for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(150, 255, 170, ${rand() * .5})`; ctx.fillRect(rand() * 320, rand() * 240, 2, 2); }
  } else if (seed % 3 === 1) {
    // Terminal text.
    ctx.fillStyle = "rgba(125, 255, 154, .8)";
    ctx.font = "13px monospace";
    const words = ["mov", "eax", "shield", "proof", "zec", "nullifier", "root", "ok", "verify", "memo", "orchard", "key"];
    for (let y = 22; y < 230; y += 17) {
      let line = "";
      while (line.length < 32) line += `${words[Math.floor(rand() * words.length)]} `;
      ctx.fillText(line, 12, y);
    }
  } else {
    // A lit, empty screen.
    const g = ctx.createRadialGradient(160, 120, 10, 160, 120, 190);
    g.addColorStop(0, "rgba(140, 255, 170, .75)");
    g.addColorStop(1, "rgba(20, 80, 40, .4)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 320, 240);
  }
  ctx.fillStyle = "rgba(0, 0, 0, .3)";
  for (let y = 0; y < 240; y += 3) ctx.fillRect(0, y, 320, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The in-room viewer: a full-screen CRT with channels and slides. */
export function openLearningTv(host: HTMLElement, startChannel = 0): () => void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const viewer = document.createElement("section");
  viewer.className = "hidn-tv";
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-modal", "true");
  viewer.setAttribute("aria-label", "Zcash learning channels");
  viewer.innerHTML = `
    <div class="hidn-tv__set">
      <div class="hidn-tv__screen">
        <div class="hidn-tv__slide" data-tv-slide aria-live="polite"></div>
        <div class="hidn-tv__glass" aria-hidden="true"></div>
        <span class="hidn-tv__more" aria-hidden="true">↓ SCROLL FOR MORE</span>
      </div>
      <div class="hidn-tv__controls">
        <button type="button" data-tv-prev aria-label="Previous slide">[ ◂ ]</button>
        <span data-tv-count></span>
        <button type="button" data-tv-next aria-label="Next slide">[ ▸ ]</button>
        <button type="button" data-tv-close aria-label="Close the television">[ × CLOSE ]</button>
      </div>
    </div>
    <nav class="hidn-tv__channels" aria-label="Channels">
      ${TV_CHANNELS.map((ch, i) => `<button type="button" data-tv-channel="${i}"><span>CH ${ch.number}</span> ${ch.title}</button>`).join("")}
    </nav>`;
  host.append(viewer);
  const slideEl = viewer.querySelector<HTMLElement>("[data-tv-slide]")!;
  const countEl = viewer.querySelector<HTMLElement>("[data-tv-count]")!;
  let channel = startChannel, slide = 0;
  let timer = 0;
  const abort = new AbortController();

  const render = (): void => {
    const ch = TV_CHANNELS[channel];
    const s = ch.slides[slide];
    slideEl.innerHTML = `<p class="hidn-tv__ch">CH ${ch.number} / ${ch.title}</p><h2>${s.heading}</h2><p class="hidn-tv__body">${s.body}</p>`
      + (s.detail ? `<p class="hidn-tv__detail">&gt; ${s.detail}</p>` : "")
      + (s.link ? `<a class="hidn-tv__link" href="${s.link.href}" target="_blank" rel="noopener noreferrer">[ ${s.link.label} ↗ ]</a>` : "")
      + `<p class="hidn-tv__source">${ch.source ?? TV_SOURCE}</p>`;
    slideEl.scrollTop = 0;
    requestAnimationFrame(() => viewer.classList.toggle("hidn-tv--more", slideEl.scrollHeight > slideEl.clientHeight + 8));
    countEl.textContent = `${String(slide + 1).padStart(2, "0")}/${String(ch.slides.length).padStart(2, "0")}`;
    viewer.querySelectorAll<HTMLButtonElement>("[data-tv-channel]").forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.tvChannel) === channel)));
    slideEl.classList.remove("hidn-tv__slide--tune");
    void slideEl.offsetWidth;
    slideEl.classList.add("hidn-tv__slide--tune");
  };
  // Slides advance on their own until the visitor starts reading or tapping.
  let autoplay = !reduced;
  const schedule = (): void => {
    window.clearTimeout(timer);
    if (autoplay) timer = window.setTimeout(() => step(1), 9000);
  };
  const takeControl = (): void => { autoplay = false; window.clearTimeout(timer); };
  const step = (delta: number): void => {
    const count = TV_CHANNELS[channel].slides.length;
    slide += delta;
    if (slide >= count) { slide = 0; channel = (channel + 1) % TV_CHANNELS.length; }
    if (slide < 0) slide = count - 1;
    render();
    schedule();
  };
  const close = (): void => {
    abort.abort();
    window.clearTimeout(timer);
    viewer.remove();
  };
  slideEl.addEventListener("scroll", () => {
    takeControl();
    viewer.classList.toggle("hidn-tv--more", slideEl.scrollTop + slideEl.clientHeight < slideEl.scrollHeight - 8);
  }, { signal: abort.signal });
  viewer.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (!target) return;
    takeControl();
    if (target.matches("[data-tv-prev]")) step(-1);
    else if (target.matches("[data-tv-next]")) step(1);
    else if (target.matches("[data-tv-close]")) close();
    else if (target.dataset.tvChannel) { channel = Number(target.dataset.tvChannel); slide = 0; render(); schedule(); }
  }, { signal: abort.signal });
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") takeControl();
    if (event.key === "Escape") close();
    else if (event.key === "ArrowRight") step(1);
    else if (event.key === "ArrowLeft") step(-1);
    else if (/^[1-8]$/.test(event.key)) { channel = Number(event.key) - 1; slide = 0; render(); schedule(); }
  }, { signal: abort.signal });
  render();
  schedule();
  viewer.querySelector<HTMLButtonElement>("[data-tv-next]")?.focus();
  return close;
}
