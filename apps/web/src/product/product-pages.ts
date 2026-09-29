import {
  AlertMessage,
  CategoryTag,
  EmptyState,
  ErrorState,
  FooterShell,
  GhostButton,
  ManifestoStatement,
  NavigationShell,
  PrimaryButton,
  PrivacyBadge,
  SecondaryButton,
  SelectControl,
  StatusIndicator,
  SystemMessage,
  TextArea,
  TerminalLabel,
  TransmissionDivider,
  VisibilityToggle,
  bindComponentInteractions,
  escapeHtml,
} from "@hidn/ui";
import {
  CONFESS_METADATA,
  EXPLORE_METADATA,
  HOME_METADATA,
  ROOM_METADATA,
  type HidnMetadata,
} from "../metadata";
import {
  createMockConfession,
  getMockConfession,
  isMockCategory,
  MOCK_INCOMING_TRANSMISSIONS,
  MOCK_CONFESSIONS,
  mockFlow,
  type FlowStep,
  type MockCategory,
  type MockConfession,
  type MockIncomingTransmission,
  type ProofState,
  resetMockFlow,
} from "./mock-data";
import { fetchCipherScanMainnetTip } from "./cipherscan";
import {
  createRoomSession,
  fetchRoomConfig,
  loginRoomSession,
  verifyRoomDemoPayment,
} from "./room-api";

export interface RenderedProductRoute {
  html: string;
  metadata: HidnMetadata;
}

type FeedTab = "latest" | "random" | "felt";
type RoomChannel = "general" | "love" | "privacy" | "politics" | "family" | "work";
type RoomAccessMode = "choose" | "create" | "login" | "ready";
type ShareCardType = "THREAD" | "REPLY" | "TEXT" | "BATCH";

let activeFeedTab: FeedTab = "latest";
let proofRunActive = false;
let roomAccessMode: RoomAccessMode = "choose";
let roomDemoId = "";
let roomDemoMemo = "";
let roomLoginError = "";
let roomZecAmount = "CALCULATING...";
let roomZecRateStatus = "";
let roomBackendStatus: "local" | "connecting" | "connected" | "offline" = "local";
let roomBackendId = "";
let activeRoomChannel: RoomChannel = "general";
let roomChannelNotice = "";
let homeStreamTimer: number | undefined;
let homeReceivingTimer: number | undefined;
let homeHeadlineTimer: number | undefined;
let homeHeadlineCursorTimer: number | undefined;
let homeHeadlineHasRun = false;
let visitorClockTimer: number | undefined;
let activeTextSelection: SelectedTextItem | undefined;
let selectedTextBatch: SelectedTextItem[] = [];
let textSelectionInteractionsBound = false;
let textSelectionRoot: ParentNode | undefined;

interface AnonymousReply {
  text: string;
  time: string;
}

interface TransmissionView {
  id?: string;
  reference?: string;
  text: string;
  time: string;
  category?: string;
  reactions?: number;
}

interface SelectedTextItem {
  text: string;
  id: string;
  label: string;
  kind: "thread" | "reply" | "text";
  category: string;
  time: string;
}

const roomChannelOptions: Array<{
  key: RoomChannel;
  label: string;
  description: string;
  categories?: MockCategory[];
}> = [
  { key: "general", label: "GENERAL", description: "all signals" },
  { key: "love", label: "LOVE", description: "what stays unsaid", categories: ["RELATIONSHIPS", "JOY"] },
  { key: "privacy", label: "PRIVACY", description: "the hidden layer", categories: ["IDENTITY", "LONELINESS"] },
  { key: "politics", label: "POLITICS", description: "power / public life", categories: ["UNCERTAINTY", "MONEY"] },
  { key: "family", label: "FAMILY", description: "the rooms we inherit", categories: ["FAMILY", "RELATIONSHIPS"] },
  { key: "work", label: "WORK", description: "survival / ambition", categories: ["CAREER", "AMBITION", "MONEY"] },
];

interface HomeAudioSession {
  context: AudioContext;
  master: GainNode;
  noise: AudioBufferSourceNode;
  motifTimer: number;
  oscillators: OscillatorNode[];
  pulseTimer: number;
  radarTimer: number;
  staticTimer: number;
}

const HOME_STREAM_LIMIT = 4;
const HOME_HEADLINE_LINES = ["SAY WHAT YOU", "CAN'T SAY", "PUBLICLY."] as const;
const CIPHERSCAN_CACHE_DURATION_MS = 60_000;
let homeStreamItems: TransmissionView[] = MOCK_CONFESSIONS.slice(0, HOME_STREAM_LIMIT)
  .reverse()
  .map((confession) => ({
    text: confession.text,
    time: confession.time,
    category: confession.category,
  }));
let homeStreamCursor = 0;
let homeAudioSession: HomeAudioSession | undefined;
let cachedCipherScanHeight: number | undefined;
let cachedCipherScanAt = 0;
let cipherScanRequest: Promise<number> | undefined;
const roomThreadReplies = new Map<string, AnonymousReply[]>([
  [
    "00417",
    [
      { text: "You can miss an old version of yourself without wanting to go back.", time: "8 MIN AGO" },
      { text: "The room understands this one.", time: "4 MIN AGO" },
    ],
  ],
  [
    "00416",
    [{ text: "Choosing slowly is still choosing. You do not owe the room a performance.", time: "11 MIN AGO" }],
  ],
]);
const roomLikeCounts = new Map<string, number>();
const roomLikedIds = new Set<string>();

const categoryOptions: Array<{ value: MockCategory; label: string }> = [
  { value: "REGRET", label: "Regret" },
  { value: "CAREER", label: "Career" },
  { value: "RELATIONSHIPS", label: "Relationships" },
  { value: "FEAR", label: "Fear" },
  { value: "LONELINESS", label: "Loneliness" },
  { value: "AMBITION", label: "Ambition" },
  { value: "FAMILY", label: "Family" },
  { value: "MONEY", label: "Money" },
  { value: "IDENTITY", label: "Identity" },
  { value: "UNCERTAINTY", label: "Uncertainty" },
  { value: "JOY", label: "Joy" },
];

function formatTransmissionTime(value: string): string {
  if (/^\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  }).format(date);
}

function transmissionViewFromConfession(confession: MockConfession): TransmissionView {
  return {
    id: confession.id,
    reference: confession.reference,
    text: confession.text,
    time: confession.time,
    category: confession.category,
    reactions: confession.reactions,
  };
}

function repliesForThread(id: string): AnonymousReply[] {
  const replies = roomThreadReplies.get(id);
  if (replies) {
    return replies;
  }

  const emptyReplies: AnonymousReply[] = [];
  roomThreadReplies.set(id, emptyReplies);
  return emptyReplies;
}

function reactionCountForThread(id: string, fallback = 0): number {
  return roomLikeCounts.get(id) ?? fallback;
}

function renderTransmissionRow(
  transmission: TransmissionView,
  options: { href?: string; incoming?: boolean } = {},
): string {
  const className = options.incoming ? " transmission-row--incoming motion-transmission-arrival" : "";
  const category = transmission.category
    ? `<span class="transmission-row__category">${escapeHtml(transmission.category)}</span>`
    : "";
  const threadId = transmission.id;
  const shareTextAttributes = threadId
    ? `data-share-text data-share-id="${escapeHtml(threadId)}" data-share-kind="thread" data-share-label="${escapeHtml(transmission.reference ?? "ANONYMOUS THREAD")}" data-share-category="${escapeHtml(transmission.category ?? "IDENTITY")}" data-share-time="${escapeHtml(transmission.time)}"`
    : "";
  const action = options.href && threadId
    ? `<div class="transmission-row__actions">
        <button class="room-message__action" type="button" data-action="room-like" data-thread-id="${escapeHtml(threadId)}" aria-pressed="${roomLikedIds.has(threadId)}">♡ ${reactionCountForThread(threadId, transmission.reactions)}</button>
        <a class="room-message__action" href="${escapeHtml(options.href)}">COMMENTS ${repliesForThread(threadId).length}</a>
        <button class="room-message__action" type="button" data-action="thread-save-image" data-thread-id="${escapeHtml(threadId)}">SAVE IMAGE</button>
        <button class="room-message__action" type="button" data-action="thread-share-image" data-thread-id="${escapeHtml(threadId)}">SHARE IMAGE</button>
        <a class="transmission-row__view" href="${escapeHtml(options.href)}">OPEN <span aria-hidden="true">→</span></a>
        <span class="thread-share-status" data-share-status="${escapeHtml(threadId)}" role="status" aria-live="polite"></span>
      </div>`
    : options.href
      ? `<a class="transmission-row__view" href="${escapeHtml(options.href)}">OPEN <span aria-hidden="true">→</span></a>`
      : "";

  return `<article class="transmission-row${className}">
    <div class="transmission-row__meta">
      <span>${escapeHtml(transmission.reference ?? "ANONYMOUS MESSAGE")}</span>
      <time>${escapeHtml(formatTransmissionTime(transmission.time))}</time>
    </div>
    <p class="transmission-row__thought" ${shareTextAttributes}>“${escapeHtml(transmission.text)}”</p>
    <footer class="transmission-row__footer">
      ${category}
      ${action}
    </footer>
  </article>`;
}

function renderHomeTransmissionRows(): string {
  return homeStreamItems
    .map((transmission, index) => renderTransmissionRow(transmission, { incoming: index === homeStreamItems.length - 1 }))
    .join("");
}

function renderHomeRoomCards(limit?: number): string {
  const cards: TransmissionView[] = [
    ...MOCK_CONFESSIONS.slice(0, 7).map(transmissionViewFromConfession),
    ...MOCK_INCOMING_TRANSMISSIONS.slice(0, 5).map((transmission) => ({
      text: transmission.text,
      time: transmission.time,
      category: "INCOMING",
    })),
  ];
  const positions = [
    ["5%", "19%", "-8deg", "0.8", "-1s", "17s", "-0.85rem"],
    ["80%", "14%", "7deg", "0.76", "-7s", "21s", "0.85rem"],
    ["11%", "48%", "5deg", "0.7", "-11s", "19s", "-0.65rem"],
    ["82%", "45%", "-6deg", "0.72", "-4s", "23s", "0.7rem"],
    ["2%", "73%", "-4deg", "0.67", "-15s", "20s", "-0.5rem"],
    ["78%", "73%", "8deg", "0.7", "-8s", "18s", "0.65rem"],
    ["29%", "13%", "-3deg", "0.62", "-2s", "24s", "-0.35rem"],
    ["63%", "8%", "4deg", "0.58", "-17s", "22s", "0.4rem"],
    ["30%", "76%", "6deg", "0.58", "-10s", "26s", "-0.5rem"],
    ["61%", "77%", "-5deg", "0.62", "-20s", "19s", "0.6rem"],
    ["15%", "4%", "-7deg", "0.5", "-13s", "27s", "-0.25rem"],
    ["87%", "27%", "5deg", "0.5", "-18s", "25s", "0.35rem"],
  ] as const;

  return cards.slice(0, limit ?? cards.length)
    .map((transmission, index) => {
      const [left, top, rotation, scale, delay, duration, driftX] = positions[index % positions.length];
      const category = transmission.category ?? "ROOM";

      return `<article class="home-room-card" style="--card-left:${left};--card-top:${top};--card-rotation:${rotation};--card-scale:${scale};--card-delay:${delay};--card-duration:${duration};--card-drift-x:${driftX};">
        <span class="home-room-card__meta">ANONYMOUS / ${escapeHtml(category)}</span>
        <p>“${escapeHtml(transmission.text)}”</p>
        <footer><span>PRIVATE ROOM</span><time>${escapeHtml(formatTransmissionTime(transmission.time))}</time></footer>
      </article>`;
    })
    .join("");
}

function renderPointerSpotlight(): string {
  return `<div class="hidn-pointer-spotlight" aria-hidden="true"></div>`;
}

function renderPreviewTransmission(): string {
  return renderTransmissionRow({
    text: mockFlow.thought,
    time: "NOW",
    category: mockFlow.category,
  });
}

function setHomeReceivingStatus(root: ParentNode, state: "ambient" | "receiving" | "static"): void {
  const status = root.querySelector<HTMLElement>("[data-home-receiving]");
  const label = status?.querySelector<HTMLElement>(".ui-status-indicator > span:last-child");
  if (!status || !label) {
    return;
  }

  status.dataset.state = state;
  label.textContent =
    state === "receiving"
      ? "RECEIVING... / SIMULATED"
      : state === "static"
        ? "STATIC / REDUCED MOTION"
        : "LOCAL MOCK / AMBIENT";
}

function getCipherScanMainnetTip(): Promise<number> {
  if (cachedCipherScanHeight !== undefined && Date.now() - cachedCipherScanAt < CIPHERSCAN_CACHE_DURATION_MS) {
    return Promise.resolve(cachedCipherScanHeight);
  }

  if (!cipherScanRequest) {
    cipherScanRequest = fetchCipherScanMainnetTip()
      .then((height) => {
        cachedCipherScanHeight = height;
        cachedCipherScanAt = Date.now();
        return height;
      })
      .finally(() => {
        cipherScanRequest = undefined;
      });
  }

  return cipherScanRequest;
}

async function refreshZcashNetworkStatus(root: ParentNode): Promise<void> {
  const status = root.querySelector<HTMLElement>(".ui-nav-shell__status");
  if (!status || status.textContent?.trim() !== "BUILT ON ZCASH") {
    return;
  }

  status.setAttribute("aria-live", "polite");
  status.title = "Checking the current Zcash mainnet block with CipherScan.";

  try {
    const height = await getCipherScanMainnetTip();
    if (!status.isConnected) {
      return;
    }

    const formattedHeight = new Intl.NumberFormat("en-US").format(height);
    status.textContent = `BUILT ON ZCASH / BLOCK #${formattedHeight}`;
    status.dataset.zcashState = "live";
    status.title = `Zcash mainnet block #${formattedHeight} from CipherScan.`;
  } catch {
    if (!status.isConnected) {
      return;
    }

    status.dataset.zcashState = "unavailable";
    status.title = "CipherScan could not provide the current Zcash mainnet block.";
  }
}

async function refreshRoomConfig(root: ParentNode): Promise<void> {
  const amount = root.querySelector<HTMLElement>("[data-room-zec-amount]");
  const status = root.querySelector<HTMLElement>("[data-room-rate-status]");
  if (!amount) {
    return;
  }

  amount.textContent = roomZecAmount;
  if (status) {
    status.textContent = roomZecRateStatus;
  }

  try {
    const config = await fetchRoomConfig();
    roomZecAmount = `${config.zecAmount} ZEC`;
    roomZecRateStatus = `LIVE USD/ZEC RATE / ${config.source.toUpperCase()}`;
  } catch {
    roomZecAmount = "BACKEND OFFLINE";
    roomZecRateStatus = "CONNECT CLOUDFLARE WORKER TO CALCULATE";
  }

  if (!amount.isConnected) {
    return;
  }

  amount.textContent = roomZecAmount;
  if (status) {
    status.textContent = roomZecRateStatus;
  }
}

function roomBackendStatusLabel(): string {
  switch (roomBackendStatus) {
    case "connecting":
      return "SYNCING WORKER";
    case "connected":
      return "BACKEND READY";
    case "offline":
      return "LOCAL DEMO / BACKEND OFFLINE";
    default:
      return "LOCAL DEMO";
  }
}

async function registerRoomBackend(): Promise<void> {
  try {
    const response = await createRoomSession({
      memoReference: roomDemoMemo,
      returnAddress: "",
    });
    if (!response.accessCode) {
      throw new Error("The Worker did not return an access code.");
    }

    roomDemoId = response.accessCode;
    roomBackendId = response.roomId;
    roomBackendStatus = "connected";
    roomLoginError = "";
    sessionStorage.setItem("hidn:room:secret", roomDemoId);
    sessionStorage.setItem("hidn:room:backend-id", roomBackendId);
  } catch (error) {
    roomBackendStatus = "offline";
    roomLoginError = error instanceof Error ? error.message : "The Worker could not issue an access code.";
  }

  if (normalizePath(window.location.pathname) === "/room/access" && roomAccessMode === "create") {
    rerenderProductRoute();
  }
}

async function verifyRoomBackend(): Promise<void> {
  if (!roomBackendId) {
    return;
  }

  try {
    const response = await verifyRoomDemoPayment(roomBackendId, roomDemoId);
    if (response.status !== "verified") {
      throw new Error("The Worker did not verify this access code.");
    }

    roomBackendStatus = "connected";
    roomLoginError = "";
    roomAccessMode = "ready";
    sessionStorage.setItem("hidn:room:verified", "true");
  } catch (error) {
    roomBackendStatus = "offline";
    roomLoginError = error instanceof Error ? error.message : "The Worker could not verify this access code.";
  }

  if (normalizePath(window.location.pathname) === "/room/access") {
    rerenderProductRoute();
  }
}

async function syncRoomLogin(accessCode: string): Promise<void> {
  try {
    const response = await loginRoomSession(accessCode);
    if (response.status !== "verified") {
      throw new Error("This access code is not verified yet.");
    }

    roomDemoId = accessCode.trim();
    roomBackendId = response.roomId;
    roomBackendStatus = "connected";
    roomLoginError = "";
    roomAccessMode = "ready";
    sessionStorage.setItem("hidn:room:secret", roomDemoId);
    sessionStorage.setItem("hidn:room:backend-id", roomBackendId);
    sessionStorage.setItem("hidn:room:verified", "true");
  } catch (error) {
    roomBackendStatus = "offline";
    roomLoginError = error instanceof Error ? error.message : "The Worker could not verify this access code.";
  }

  if (normalizePath(window.location.pathname) === "/room/access") {
    rerenderProductRoute();
  }
}

function stopHomeStream(): void {
  if (homeStreamTimer !== undefined) {
    window.clearInterval(homeStreamTimer);
    homeStreamTimer = undefined;
  }

  if (homeReceivingTimer !== undefined) {
    window.clearTimeout(homeReceivingTimer);
    homeReceivingTimer = undefined;
  }
}

function setHomeAudioState(root: ParentNode, enabled: boolean): void {
  const button = root.querySelector<HTMLButtonElement>("#home-audio-toggle");
  const label = root.querySelector<HTMLElement>("[data-home-audio-label]");
  if (!button) {
    return;
  }

  button.setAttribute("aria-pressed", String(enabled));
  button.dataset.state = enabled ? "on" : "off";
  if (label) {
    label.textContent = enabled ? "ON" : "OFF";
  }
}

function setHomeAudioUnavailable(root: ParentNode): void {
  const button = root.querySelector<HTMLButtonElement>("#home-audio-toggle");
  const label = root.querySelector<HTMLElement>("[data-home-audio-label]");
  if (!button) {
    return;
  }

  button.disabled = true;
  button.dataset.state = "unavailable";
  button.setAttribute("aria-label", "Ambient room sound unavailable in this browser");
  if (label) {
    label.textContent = "N/A";
  }
}

function startHomeAudio(root: ParentNode): void {
  if (typeof window.AudioContext === "undefined") {
    setHomeAudioUnavailable(root);
    return;
  }

  if (homeAudioSession) {
    void homeAudioSession.context.resume();
    setHomeAudioState(root, true);
    return;
  }

  const context = new window.AudioContext();
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const filter = context.createBiquadFilter();
  const subFilter = context.createBiquadFilter();
  const oscillators: OscillatorNode[] = [];

  master.gain.setValueAtTime(0.0001, context.currentTime);
  compressor.threshold.value = -32;
  compressor.knee.value = 16;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.42;
  master.connect(compressor).connect(context.destination);

  filter.type = "lowpass";
  filter.frequency.value = 540;
  filter.Q.value = 1.4;
  filter.connect(master);

  subFilter.type = "lowpass";
  subFilter.frequency.value = 260;
  subFilter.Q.value = 0.7;
  subFilter.connect(master);

  const addTone = (
    frequency: number,
    type: OscillatorType,
    volume: number,
    detune = 0,
    destination: AudioNode = filter,
  ): void => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    oscillator.detune.value = detune;
    gain.gain.value = volume;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    oscillators.push(oscillator);
  };

  addTone(36.71, "sine", 0.54, 0, subFilter);
  addTone(55, "triangle", 0.1, -5, subFilter);
  addTone(73.42, "sawtooth", 0.018, 4, subFilter);
  addTone(110, "sine", 0.028, 3);
  addTone(146.83, "sawtooth", 0.009, -8);

  const filterLfo = context.createOscillator();
  const filterLfoDepth = context.createGain();
  filterLfo.frequency.value = 0.045;
  filterLfoDepth.gain.value = 72;
  filterLfo.connect(filterLfoDepth).connect(filter.frequency);
  filterLfo.start();
  oscillators.push(filterLfo);

  const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let index = 0; index < noiseData.length; index += 1) {
    noiseData[index] = (Math.random() * 2 - 1) * 0.2;
  }

  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 720;
  noiseFilter.Q.value = 0.8;
  noiseGain.gain.value = 0.008;
  noise.connect(noiseFilter).connect(noiseGain).connect(master);
  noise.start();

  const noteDelay = context.createDelay(1);
  const delayFeedback = context.createGain();
  noteDelay.delayTime.value = 0.58;
  delayFeedback.gain.value = 0.24;
  noteDelay.connect(delayFeedback).connect(noteDelay);
  noteDelay.connect(master);

  // A slow, six-step signal signature: three notes, a gap, then a low return.
  // The rest is intentional; it keeps the phrase atmospheric instead of game-like.
  const motif = [146.83, 110, 0, 98, 73.42, 0];
  let motifIndex = 0;
  const playMotifNote = (): void => {
    const now = context.currentTime + 0.02;
    const frequency = motif[motifIndex % motif.length];
    motifIndex += 1;
    if (frequency === 0) {
      return;
    }

    const oscillator = context.createOscillator();
    const harmonic = context.createOscillator();
    const harmonicGain = context.createGain();
    const envelope = context.createGain();
    const noteFilter = context.createBiquadFilter();

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(frequency, now);
    harmonic.type = "sine";
    harmonic.frequency.setValueAtTime(frequency * 2, now);
    harmonic.detune.value = -11;
    harmonicGain.gain.value = 0.08;
    noteFilter.type = "lowpass";
    noteFilter.frequency.value = Math.min(1150, frequency * 4.5);
    noteFilter.Q.value = 1.8;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(motifIndex % motif.length === 1 ? 0.062 : 0.045, now + 0.04);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.86);

    oscillator.connect(envelope);
    harmonic.connect(harmonicGain).connect(envelope);
    envelope.connect(noteFilter);
    noteFilter.connect(master);
    noteFilter.connect(noteDelay);
    oscillator.start(now);
    harmonic.start(now);
    oscillator.stop(now + 0.74);
    harmonic.stop(now + 0.74);
  };

  const pulse = (): void => {
    const now = context.currentTime;
    [
      { offset: 0, frequency: 52, endFrequency: 31, volume: 0.13, duration: 0.7 },
      { offset: 0.22, frequency: 44, endFrequency: 28, volume: 0.065, duration: 0.52 },
    ].forEach(({ offset, frequency, endFrequency, volume, duration }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + offset;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration * 0.58);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.045);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    });
  };

  const radarPing = (): void => {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const harmonic = context.createOscillator();
    const gain = context.createGain();
    const harmonicGain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(920, now);
    oscillator.frequency.exponentialRampToValueAtTime(430, now + 0.26);
    harmonic.type = "sine";
    harmonic.frequency.setValueAtTime(1840, now);
    harmonic.frequency.exponentialRampToValueAtTime(860, now + 0.26);
    harmonicGain.gain.value = 0.22;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.038, now + 0.022);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    harmonic.connect(harmonicGain).connect(gain);
    oscillator.connect(gain).connect(master);
    harmonic.start(now);
    harmonic.stop(now + 0.38);
    oscillator.start(now);
    oscillator.stop(now + 0.38);
  };

  const staticBurst = (): void => {
    const now = context.currentTime;
    noiseGain.gain.cancelScheduledValues(now);
    noiseGain.gain.setValueAtTime(0.008, now);
    noiseGain.gain.linearRampToValueAtTime(0.026, now + 0.025);
    noiseGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.18);
    noiseGain.gain.linearRampToValueAtTime(0.008, now + 0.52);
  };

  const motifTimer = window.setInterval(playMotifNote, 720);
  const pulseTimer = window.setInterval(pulse, 2680);
  const radarTimer = window.setInterval(radarPing, 4300);
  const staticTimer = window.setInterval(staticBurst, 6200);
  homeAudioSession = { context, master, noise, motifTimer, oscillators, pulseTimer, radarTimer, staticTimer };
  master.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 1.6);
  playMotifNote();
  pulse();
  radarPing();
  staticBurst();
  setHomeAudioState(root, true);

  void context.resume().catch(() => {
    stopHomeAudio(root);
  });
}

function stopHomeAudio(root?: ParentNode): void {
  const session = homeAudioSession;
  homeAudioSession = undefined;
  if (!session) {
    if (root) {
      setHomeAudioState(root, false);
    }
    return;
  }

  window.clearInterval(session.pulseTimer);
  window.clearInterval(session.motifTimer);
  window.clearInterval(session.radarTimer);
  window.clearInterval(session.staticTimer);
  const now = session.context.currentTime;
  session.master.gain.cancelScheduledValues(now);
  session.master.gain.setTargetAtTime(0.0001, now, 0.12);

  window.setTimeout(() => {
    session.oscillators.forEach((oscillator) => {
      try {
        oscillator.stop();
      } catch {
        // The oscillator may have already stopped during teardown.
      }
    });
    try {
      session.noise.stop();
    } catch {
      // The noise source may have already stopped during teardown.
    }
    void session.context.close();
  }, 500);

  if (root) {
    setHomeAudioState(root, false);
  }
}

function toggleHomeAudio(root: ParentNode): void {
  if (homeAudioSession) {
    stopHomeAudio(root);
    return;
  }

  startHomeAudio(root);
}

function receiveHomeTransmission(root: ParentNode): void {
  if (normalizePath(window.location.pathname) !== "/") {
    stopHomeStream();
    return;
  }

  const transmission: MockIncomingTransmission =
    MOCK_INCOMING_TRANSMISSIONS[homeStreamCursor % MOCK_INCOMING_TRANSMISSIONS.length];
  homeStreamCursor = (homeStreamCursor + 1) % MOCK_INCOMING_TRANSMISSIONS.length;
  homeStreamItems = [
    ...homeStreamItems.slice(-(HOME_STREAM_LIMIT - 1)),
    { text: transmission.text, time: transmission.time },
  ];

  const list = root.querySelector<HTMLElement>("#home-transmission-list");
  if (!list) {
    return;
  }

  list.innerHTML = renderHomeTransmissionRows();
  setHomeReceivingStatus(root, "receiving");

  if (homeReceivingTimer !== undefined) {
    window.clearTimeout(homeReceivingTimer);
  }

  homeReceivingTimer = window.setTimeout(() => {
    setHomeReceivingStatus(root, "ambient");
    homeReceivingTimer = undefined;
  }, 1600);
}

function startHomeStream(root: ParentNode): void {
  stopHomeStream();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setHomeReceivingStatus(root, "static");
    return;
  }

  setHomeReceivingStatus(root, "ambient");
  homeStreamTimer = window.setInterval(() => receiveHomeTransmission(root), 6500);
}

function clearHomeHeadlineTimers(): void {
  if (homeHeadlineTimer !== undefined) {
    window.clearInterval(homeHeadlineTimer);
    homeHeadlineTimer = undefined;
  }

  if (homeHeadlineCursorTimer !== undefined) {
    window.clearTimeout(homeHeadlineCursorTimer);
    homeHeadlineCursorTimer = undefined;
  }
}

function renderFullHomeHeadline(root: ParentNode): void {
  const lines = root.querySelectorAll<HTMLElement>("[data-home-headline-line]");
  const cursor = root.querySelector<HTMLElement>("[data-home-headline-cursor]");
  if (lines.length !== HOME_HEADLINE_LINES.length || !cursor) {
    return;
  }

  lines.forEach((line, index) => {
    line.textContent = HOME_HEADLINE_LINES[index];
  });
  lines[lines.length - 1].append(cursor);
  cursor.dataset.state = "hidden";
}

function renderHomeHeadlineProgress(root: ParentNode, characterCount: number): void {
  const lines = [...root.querySelectorAll<HTMLElement>("[data-home-headline-line]")];
  const cursor = root.querySelector<HTMLElement>("[data-home-headline-cursor]");
  if (lines.length !== HOME_HEADLINE_LINES.length || !cursor) {
    return;
  }

  let remaining = characterCount;
  let activeLine = lines[0];

  lines.forEach((line, index) => {
    const lineText = HOME_HEADLINE_LINES[index];
    const visibleCharacters = Math.max(0, Math.min(lineText.length, remaining));
    line.textContent = lineText.slice(0, visibleCharacters);
    remaining -= lineText.length;
    if (visibleCharacters < lineText.length || index === lines.length - 1) {
      activeLine = line;
    }
  });

  activeLine.append(cursor);
  cursor.dataset.state = "typing";
}

function startHomeHeadline(root: ParentNode): void {
  if (homeHeadlineHasRun) {
    renderFullHomeHeadline(root);
    return;
  }

  homeHeadlineHasRun = true;
  clearHomeHeadlineTimers();

  const cursor = root.querySelector<HTMLElement>("[data-home-headline-cursor]");
  const composer = root.querySelector<HTMLElement>(".home-composer");
  if (!cursor) {
    renderFullHomeHeadline(root);
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    renderFullHomeHeadline(root);
    return;
  }

  const totalCharacters = HOME_HEADLINE_LINES.reduce((total, line) => total + line.length, 0);
  const characterDelay = 42;
  let characterCount = 0;
  renderHomeHeadlineProgress(root, characterCount);
  if (composer) {
    composer.dataset.headlineState = "typing";
  }

  homeHeadlineTimer = window.setInterval(() => {
    characterCount += 1;
    renderHomeHeadlineProgress(root, characterCount);

    if (characterCount >= totalCharacters) {
      clearHomeHeadlineTimers();
      cursor.dataset.state = "settling";
      homeHeadlineCursorTimer = window.setTimeout(() => {
        cursor.dataset.state = "hidden";
        if (composer) {
          composer.dataset.headlineState = "ready";
        }
        homeHeadlineCursorTimer = undefined;
      }, 460);
    }
  }, characterDelay);
}

function stopHomeHeadline(): void {
  clearHomeHeadlineTimers();
  homeHeadlineHasRun = false;
}

function normalizePath(path: string): string {
  const cleanPath = path.replace(/\/+$/, "");
  return cleanPath || "/";
}

function actionLink(
  label: string,
  href: string,
  variant: "primary" | "secondary" | "ghost",
  className = "",
): string {
  return `<a class="ui-button ui-button--${variant}${className ? ` ${className}` : ""}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function formatVisitorLocalTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) {
        break;
      }
    } else {
      current = candidate;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length === maxLines && words.length > 0) {
    const lastIndex = lines.length - 1;
    let last = lines[lastIndex];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) {
      last = last.slice(0, -1).trim();
    }
    lines[lastIndex] = `${last}…`;
  }

  return lines;
}

function drawCanvasRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const corner = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + corner, y);
  ctx.lineTo(x + width - corner, y);
  ctx.arcTo(x + width, y, x + width, y + corner, corner);
  ctx.lineTo(x + width, y + height - corner);
  ctx.arcTo(x + width, y + height, x + width - corner, y + height, corner);
  ctx.lineTo(x + corner, y + height);
  ctx.arcTo(x, y + height, x, y + height - corner, corner);
  ctx.lineTo(x, y + corner);
  ctx.arcTo(x, y, x + corner, y, corner);
  ctx.closePath();
}

interface ThreadImageReply {
  index: number;
  reply: AnonymousReply;
}

async function createThreadImage(
  confession: MockConfession,
  focusReply?: ThreadImageReply,
  cardType: ShareCardType = "THREAD",
  suppliedReplies?: AnonymousReply[],
): Promise<Blob> {
  const compactCard = cardType === "TEXT" || cardType === "REPLY";
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = compactCard ? 1000 : 1500;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas rendering is unavailable.");
  }

  const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  background.addColorStop(0, "#030806");
  background.addColorStop(0.45, "#07140d");
  background.addColorStop(1, "#010302");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glow = ctx.createRadialGradient(900, 220, 20, 900, 220, 720);
  glow.addColorStop(0, "rgba(93, 255, 143, 0.17)");
  glow.addColorStop(1, "rgba(93, 255, 143, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(93, 255, 143, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 48; x < canvas.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 48; y < canvas.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
  for (let y = 0; y < canvas.height; y += 6) {
    ctx.fillRect(0, y, canvas.width, 1);
  }

  drawCanvasRoundedRect(ctx, 34, 34, canvas.width - 68, canvas.height - 68, 34);
  ctx.fillStyle = "rgba(3, 10, 6, 0.88)";
  ctx.fill();
  ctx.strokeStyle = "rgba(93, 255, 143, 0.7)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "rgba(93, 255, 143, 0.08)";
  drawCanvasRoundedRect(ctx, 35, 35, canvas.width - 70, 176, 32);
  ctx.fill();
  ctx.strokeStyle = "rgba(93, 255, 143, 0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(72, 210);
  ctx.lineTo(canvas.width - 72, 210);
  ctx.stroke();

  const logo = await new Promise<HTMLImageElement | undefined>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(undefined);
    image.src = "/brand/hidn-symbol.png";
  });
  ctx.fillStyle = "#020504";
  drawCanvasRoundedRect(ctx, 74, 74, 92, 92, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(93, 255, 143, 0.7)";
  ctx.lineWidth = 2;
  ctx.stroke();
  if (logo) {
    ctx.drawImage(logo, 84, 84, 72, 72);
  } else {
    ctx.fillStyle = "#5dff8f";
    ctx.font = "700 30px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("H", 105, 124);
  }

  ctx.font = "700 31px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "#5dff8f";
  ctx.fillText("HIDN", 194, 111);
  ctx.fillStyle = "#a1bca7";
  ctx.font = "17px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("THE ROOM / PRIVATE SIGNALS", 194, 143);

  ctx.fillStyle = "rgba(217, 245, 222, 0.75)";
  ctx.textAlign = "right";
  ctx.font = "600 16px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("NO NAME / NO PROFILE", canvas.width - 74, 91);
  ctx.fillStyle = "#5dff8f";
  ctx.font = "700 19px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`${formatTransmissionTime(confession.time)} / ${focusReply ? "REPLY" : cardType}`, canvas.width - 74, 126);
  ctx.fillStyle = "#a1bca7";
  ctx.font = "15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("LOCAL IMAGE / HIDN", canvas.width - 74, 158);
  ctx.textAlign = "left";

  const allReplies = suppliedReplies ?? repliesForThread(confession.id);
  const replyCount = allReplies.length;
  const replies = allReplies.slice(0, 2);
  const contentX = 82;
  const contentWidth = canvas.width - 164;
  let cursorY = 258;

  const drawChatBubble = (label: string, text: string, accent: boolean, fontSize: number, maxLines: number): number => {
    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const lineHeight = Math.round(fontSize * 1.35);
    const lines = wrapCanvasText(ctx, `“${text}”`, contentWidth - 64, maxLines);
    const height = 66 + lines.length * lineHeight + 28;
    drawCanvasRoundedRect(ctx, contentX, cursorY, contentWidth, height, 24);
    ctx.fillStyle = accent ? "rgba(93, 255, 143, 0.13)" : "rgba(161, 188, 167, 0.07)";
    ctx.fill();
    ctx.strokeStyle = accent ? "rgba(93, 255, 143, 0.7)" : "rgba(161, 188, 167, 0.28)";
    ctx.lineWidth = accent ? 3 : 2;
    ctx.stroke();
    ctx.fillStyle = accent ? "#5dff8f" : "#a1bca7";
    ctx.font = "600 15px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(label, contentX + 32, cursorY + 34);
    ctx.fillStyle = "#f0f4e9";
    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    lines.forEach((line, index) => ctx.fillText(line, contentX + 32, cursorY + 78 + index * lineHeight));
    cursorY += height + 22;
    return height;
  };

  ctx.fillStyle = "#5dff8f";
  ctx.font = "700 16px ui-monospace, SFMono-Regular, Menlo, monospace";
  const cardHeading = focusReply
    ? `REPLY / ${String(focusReply.index + 1).padStart(2, "0")}`
    : cardType === "TEXT"
      ? "SELECTED TEXT"
      : cardType === "BATCH"
        ? "SELECTED TEXT / BATCH"
        : cardType === "REPLY"
          ? "SELECTED REPLY"
          : `THREAD / ${confession.reference.replace("// ", "")}`;
  ctx.fillText(cardHeading, contentX, cursorY);
  ctx.fillStyle = "#a1bca7";
  ctx.font = "15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText(`${confession.category} / ${replyCount} COMMENTS`, canvas.width - contentX, cursorY);
  ctx.textAlign = "left";
  cursorY += 30;

  if (focusReply) {
    drawChatBubble("ORIGINAL SIGNAL / CONTEXT", confession.text, false, 23, 3);
    drawChatBubble(`ANONYMOUS / REPLY ${String(focusReply.index + 1).padStart(2, "0")}`, focusReply.reply.text, true, 42, 6);
  } else {
    drawChatBubble(
      cardType === "TEXT" ? "SELECTED / EXACT TEXT" : cardType === "REPLY" ? "SELECTED / REPLY" : cardType === "BATCH" ? "SELECTED / 01" : "ANONYMOUS / ORIGINAL SIGNAL",
      confession.text,
      true,
      42,
      compactCard ? 4 : 5,
    );
  }

  ctx.fillStyle = "#5dff8f";
  ctx.font = "700 15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`REPLIES / ${String(replyCount).padStart(2, "0")}`, contentX, cursorY);
  cursorY += 28;
  replies.forEach((reply, index) => {
    if (focusReply) {
      return;
    }
    drawChatBubble(cardType === "BATCH" ? `SELECTED / ${String(index + 2).padStart(2, "0")}` : `ANONYMOUS / ${String(index + 1).padStart(2, "0")}`, reply.text, false, 23, 3);
  });

  const signalY = compactCard ? Math.max(500, cursorY + 18) : 1110;
  ctx.fillStyle = "rgba(93, 255, 143, 0.09)";
  drawCanvasRoundedRect(ctx, contentX, signalY, contentWidth, 104, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(93, 255, 143, 0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#a1bca7";
  ctx.font = "15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("THREAD SIGNAL", contentX + 26, signalY + 34);
  ctx.fillStyle = "#f0f4e9";
  ctx.font = "700 24px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`♡ ${reactionCountForThread(confession.id, confession.reactions)}`, contentX + 26, signalY + 72);
  ctx.fillStyle = "#a1bca7";
  ctx.font = "17px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText(`${replyCount} COMMENTS`, canvas.width - contentX - 26, signalY + 63);
  ctx.textAlign = "left";

  const code = `${confession.id}${focusReply ? `R${focusReply.index}` : "T"}`;
  ctx.fillStyle = "#5dff8f";
  let barX = canvas.width - contentX - 190;
  for (let index = 0; index < 24; index += 1) {
    const height = 17 + (code.charCodeAt(index % code.length) % 22);
    ctx.fillRect(barX, signalY + 127 - height, 3 + (index % 2), height);
    barX += 7;
  }

  const footerLineY = signalY + (compactCard ? 150 : 166);
  ctx.strokeStyle = "rgba(93, 255, 143, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(contentX, footerLineY);
  ctx.lineTo(canvas.width - contentX, footerLineY);
  ctx.stroke();
  ctx.fillStyle = "#5dff8f";
  ctx.font = "700 26px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("PRIVATE ROOMS WITHOUT NAMES.", contentX, footerLineY + (compactCard ? 50 : 54));
  ctx.fillStyle = "#a1bca7";
  ctx.font = "15px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("NO HANDLE / NO PROFILE / NO TRAIL", contentX, footerLineY + (compactCard ? 86 : 96));
  ctx.textAlign = "right";
  ctx.fillStyle = "#5dff8f";
  const cardFooter = focusReply
    ? "HIDN / REPLY CARD"
    : cardType === "TEXT"
      ? "HIDN / TEXT CARD"
      : cardType === "REPLY"
        ? "HIDN / REPLY CARD"
        : cardType === "BATCH"
          ? "HIDN / BATCH CARD"
          : "HIDN / THREAD CARD";
  ctx.fillText(cardFooter, canvas.width - contentX, footerLineY + (compactCard ? 86 : 96));
  ctx.textAlign = "left";

  const footerDotY = footerLineY + (compactCard ? 123 : 134);
  ctx.fillStyle = "rgba(93, 255, 143, 0.5)";
  ctx.fillRect(contentX, footerDotY, 8, 8);
  ctx.fillRect(contentX + 16, footerDotY, 8, 8);
  ctx.fillRect(contentX + 32, footerDotY, 8, 8);
  ctx.fillStyle = "#5dff8f";
  ctx.font = "600 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("HIDN://THE_ROOM", contentX + 58, footerLineY + (compactCard ? 133 : 144));

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("The thread image could not be created."));
      }
    }, "image/png");
  });
}

function downloadThreadImage(blob: Blob, confession: MockConfession, filename = `hidn-thread-${confession.id}.png`): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

function setThreadShareStatus(root: ParentNode, id: string, message: string): void {
  root.querySelectorAll<HTMLElement>('[data-share-status]').forEach((status) => {
    if (status.dataset.shareStatus === id) {
      status.textContent = message;
    }
  });
}

function selectionConfession(item: SelectedTextItem, index: number): MockConfession {
  return {
    id: `selected-${index}-${Date.now().toString(36)}`,
    reference: "// SELECTED",
    text: item.text,
    category: isMockCategory(item.category) ? item.category : "IDENTITY",
    relativeTime: "SELECTED TEXT",
    reactions: 0,
    time: item.time || new Date().toISOString(),
  };
}

function setSelectionStatus(root: ParentNode, message: string): void {
  const status = root.querySelector<HTMLElement>("[data-selection-status]");
  if (status) {
    status.textContent = message;
  }
}

async function shareSelectedTexts(root: ParentNode, items: SelectedTextItem[], mode: "save" | "share"): Promise<void> {
  if (!items.length) {
    return;
  }

  setSelectionStatus(root, "BUILDING TEXT CARD...");
  try {
    const confession = selectionConfession(items[0], items.length);
    const suppliedReplies = items.slice(1).map((item) => ({ text: item.text, time: item.time || "SELECTED" }));
    const cardType: ShareCardType = items.length > 1 ? "BATCH" : items[0].kind === "reply" ? "REPLY" : "TEXT";
    const blob = await createThreadImage(confession, undefined, cardType, suppliedReplies);
    const filename = items.length > 1 ? "hidn-selected-text-batch.png" : "hidn-selected-text.png";
    const file = new File([blob], filename, { type: "image/png" });

    if (mode === "save") {
      downloadThreadImage(blob, confession, filename);
      setSelectionStatus(root, "TEXT CARD SAVED TO DEVICE");
      return;
    }

    const canShareImage =
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });

    if (canShareImage) {
      try {
        await navigator.share({
          files: [file],
          title: items.length > 1 ? "HIDN / selected text batch" : "HIDN / selected text",
          text: "A selected text card from HIDN / THE ROOM.",
        });
        setSelectionStatus(root, "SHARE SHEET READY");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setSelectionStatus(root, "SHARE CANCELLED");
          return;
        }
      }
    }

    downloadThreadImage(blob, confession, filename);
    const xText = items.map((item) => `“${item.text}”`).join(" ");
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${xText} — HIDN / THE ROOM`)}`;
    const composer = window.open(xUrl, "_blank", "noopener,noreferrer");
    setSelectionStatus(root, composer ? "TEXT CARD SAVED / X COMPOSER OPEN" : "TEXT CARD SAVED / OPEN X TO ATTACH");
  } catch {
    setSelectionStatus(root, "TEXT CARD UNAVAILABLE");
  }
}

function replyIndexFromButton(button: HTMLButtonElement): number | undefined {
  const rawIndex = button.dataset.replyIndex;
  if (rawIndex === undefined) {
    return undefined;
  }

  const index = Number(rawIndex);
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

async function shareThreadImage(root: ParentNode, id: string, mode: "save" | "share" | "x", replyIndex?: number): Promise<void> {
  const confession = getMockConfession(id);
  if (!confession) {
    return;
  }

  const reply = replyIndex === undefined ? undefined : repliesForThread(id)[replyIndex];
  const focusReply = reply && replyIndex !== undefined ? { index: replyIndex, reply } : undefined;
  const shareKey = focusReply ? `${id}:reply:${focusReply.index}` : id;
  setThreadShareStatus(root, shareKey, "RENDERING IMAGE...");

  try {
    const cardConfession = focusReply
      ? { ...confession, reference: `// REPLY ${String(focusReply.index + 1).padStart(2, "0")}`, text: focusReply.reply.text, time: focusReply.reply.time }
      : confession;
    const blob = await createThreadImage(cardConfession, undefined, focusReply ? "REPLY" : "TEXT", []);
    const filename = focusReply
      ? `hidn-reply-${confession.id}-${focusReply.index + 1}.png`
      : `hidn-thread-${confession.id}.png`;
    const file = new File([blob], filename, { type: "image/png" });

    if (mode === "save") {
      downloadThreadImage(blob, confession, filename);
      setThreadShareStatus(root, shareKey, "IMAGE SAVED TO DEVICE");
      return;
    }

    const canShareImage =
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });

    if (mode === "share" && canShareImage) {
      try {
        await navigator.share({
          files: [file],
          title: focusReply ? "HIDN / anonymous reply" : "HIDN / anonymous thread",
          text: focusReply ? "An anonymous reply from HIDN / THE ROOM." : "An anonymous thread from HIDN / THE ROOM.",
        });
        setThreadShareStatus(root, shareKey, "SHARE SHEET READY");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setThreadShareStatus(root, shareKey, "SHARE CANCELLED");
          return;
        }
      }
    }

    downloadThreadImage(blob, confession, filename);
    const xText = `“${focusReply?.reply.text ?? confession.text}” — HIDN / THE ROOM`;
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(xText)}`;
    const composer = window.open(xUrl, "_blank", "noopener,noreferrer");
    setThreadShareStatus(
      root,
      shareKey,
      composer ? "IMAGE SAVED / X COMPOSER OPEN" : "IMAGE SAVED / OPEN X TO ATTACH",
    );
  } catch {
    setThreadShareStatus(root, shareKey, "IMAGE SHARE UNAVAILABLE");
  }
}

function selectionHostFromNode(node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest<HTMLElement>("[data-share-text]") ?? null;
}

function hideSelectionTools(root: ParentNode): void {
  const tools = root.querySelector<HTMLElement>("#hidn-selection-tools");
  if (tools) {
    tools.hidden = true;
  }
}

function updateSelectionBatch(root: ParentNode): void {
  const batch = root.querySelector<HTMLElement>("[data-selection-batch]");
  const count = root.querySelector<HTMLElement>("[data-selection-batch-count]");
  if (!batch || !count) {
    return;
  }

  batch.hidden = selectedTextBatch.length === 0;
  count.textContent = `${selectedTextBatch.length} SELECTED`;
}

function showSelectionTools(root: ParentNode, selection: Selection, item: SelectedTextItem): void {
  const tools = root.querySelector<HTMLElement>("#hidn-selection-tools");
  const preview = root.querySelector<HTMLElement>("[data-selection-preview]");
  const label = root.querySelector<HTMLElement>("[data-selection-tool-label]");
  if (!tools || !preview || !label) {
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const width = 326;
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
  const top = Math.max(12, Math.min(window.innerHeight - 188, rect.bottom + 12));
  label.textContent = `${item.kind === "reply" ? "REPLY" : item.kind === "thread" ? "THREAD" : "TEXT"} SIGNAL SELECTED`;
  preview.textContent = `“${item.text}”`;
  tools.style.left = `${left}px`;
  tools.style.top = `${top}px`;
  tools.hidden = false;
  updateSelectionBatch(root);
}

function updateTextSelection(root: ParentNode): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return;
  }

  const range = selection.getRangeAt(0);
  const startHost = selectionHostFromNode(range.startContainer);
  const endHost = selectionHostFromNode(range.endContainer);
  const text = selection.toString().replace(/\s+/g, " ").trim().replace(/^“|”$/g, "");
  if (!startHost || startHost !== endHost || text.length < 2) {
    hideSelectionTools(root);
    return;
  }

  activeTextSelection = {
    text,
    id: startHost.dataset.shareId ?? "selected",
    label: startHost.dataset.shareLabel ?? "SELECTED TEXT",
    kind: startHost.dataset.shareKind === "reply" ? "reply" : startHost.dataset.shareKind === "thread" ? "thread" : "text",
    category: startHost.dataset.shareCategory ?? "IDENTITY",
    time: startHost.dataset.shareTime ?? new Date().toISOString(),
  };
  showSelectionTools(root, selection, activeTextSelection);
}

function bindTextSelectionInteractions(root: ParentNode): void {
  textSelectionRoot = root;
  if (textSelectionInteractionsBound) {
    updateSelectionBatch(root);
    return;
  }

  textSelectionInteractionsBound = true;
  document.addEventListener("selectionchange", () => {
    if (document.activeElement?.closest("#hidn-selection-tools")) {
      return;
    }

    updateTextSelection(textSelectionRoot ?? document);
  });
  document.addEventListener("mouseup", () => {
    window.setTimeout(() => updateTextSelection(textSelectionRoot ?? document), 0);
  });
  document.addEventListener("touchend", () => {
    window.setTimeout(() => updateTextSelection(textSelectionRoot ?? document), 0);
  });
  window.addEventListener("resize", () => {
    if (activeTextSelection) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        showSelectionTools(textSelectionRoot ?? document, selection, activeTextSelection);
      }
    }
  });
  updateSelectionBatch(root);
}

function renderVisitorTimeSignal(className: string): string {
  return `<span class="${escapeHtml(className)} hidn-local-time-signal" title="Visitor local time, 24-hour format">
    <span class="hidn-local-time-signal__dot" aria-hidden="true"></span>
    <span data-visitor-local-time>${formatVisitorLocalTime()}</span>
  </span>`;
}

function startVisitorClock(root: ParentNode): void {
  if (visitorClockTimer !== undefined) {
    window.clearInterval(visitorClockTimer);
  }

  const update = (): void => {
    const time = formatVisitorLocalTime();
    root.querySelectorAll<HTMLElement>("[data-visitor-local-time]").forEach((element) => {
      element.textContent = time;
    });
  };

  update();
  visitorClockTimer = window.setInterval(update, 1000);
}

function publicNavigation(path: string): string {
  const normalizedPath = normalizePath(path);
  const links = (normalizedPath === "/" || normalizedPath === "/room" || normalizedPath === "/room/access" || normalizedPath === "/how-it-works"
    ? []
    : [
        { label: "THE ROOM", href: "/room" },
        { label: "HOW IT WORKS", href: "/how-it-works" },
        { label: "MANIFESTO", href: "/manifesto" },
      ]
  ).map((link) => ({ ...link, current: normalizedPath === link.href }));

  return NavigationShell({
    descriptor: normalizedPath === "/" ? "ANONYMOUS INTERNET NOIR" : "",
    status: normalizedPath === "/" ? "PRIVATE ROOM" : "BUILT ON ZCASH",
    links,
  });
}

function renderRoomMenu(): string {
  return `<div class="room-menu" data-room-menu>
    <button class="room-menu__toggle" type="button" data-action="room-menu-toggle" aria-expanded="false" aria-controls="room-channel-menu" aria-label="Open private room menu">
      <span class="room-menu__icon" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="room-menu__label">CHANNELS</span>
    </button>
    <div class="room-menu__panel" id="room-channel-menu" hidden>
      <div class="room-menu__panel-head">
        <span>PRIVATE ROOM / INDEX</span>
        <span class="room-menu__signal"><i aria-hidden="true"></i> LOCAL</span>
      </div>
      <nav aria-label="Private room channels">
        <a href="/how-it-works"><span>01</span> HOW IT WORKS <b aria-hidden="true">↗</b></a>
        <a href="/manifesto"><span>02</span> MANIFESTO <b aria-hidden="true">↗</b></a>
        <a href="/privacy"><span>03</span> PRIVACY <b aria-hidden="true">↗</b></a>
      </nav>
      <a class="room-menu__leave" href="/" data-room-logout>LEAVE ROOM <span aria-hidden="true">↗</span></a>
    </div>
  </div>`;
}

function publicWindowTitle(path: string): string {
  const normalizedPath = normalizePath(path);
  if (normalizedPath.startsWith("/c/")) {
    return "THREAD_ROOM";
  }

  if (normalizedPath === "/room" || normalizedPath === "/explore") {
    return "THE_ROOM";
  }

  if (normalizedPath === "/") {
    return "PRIVATE_ROOM";
  }

  return normalizedPath.slice(1).replace(/[^a-z0-9]+/gi, "_").toUpperCase();
}

function publicWindowChrome(path: string, showRoomMenu = false): string {
  return `<div class="public-page__window-chrome">
    <div class="public-page__window-bar">
      <div class="public-page__window-controls" aria-hidden="true">
        <span class="public-page__window-control public-page__window-control--close"></span>
        <span class="public-page__window-control public-page__window-control--minimize"></span>
        <span class="public-page__window-control public-page__window-control--maximize"></span>
      </div>
      <span class="public-page__window-title" aria-label="HIDN ${publicWindowTitle(path)}">HIDN://${publicWindowTitle(path)}</span>
      <div class="public-page__window-actions">
        ${renderVisitorTimeSignal("public-page__window-meta")}
        ${showRoomMenu ? renderRoomMenu() : ""}
      </div>
    </div>
  </div>`;
}

function renderSelectionTools(): string {
  return `<aside class="hidn-selection-tools" id="hidn-selection-tools" hidden aria-label="Selected text actions">
    <header class="hidn-selection-tools__header">
      <span data-selection-tool-label>TEXT SIGNAL SELECTED</span>
      <button class="hidn-selection-tools__close" type="button" data-action="selection-close" aria-label="Close text actions">×</button>
    </header>
    <p class="hidn-selection-tools__preview" data-selection-preview></p>
    <div class="hidn-selection-tools__actions">
      <button type="button" data-action="selection-save">SAVE TEXT CARD</button>
      <button type="button" data-action="selection-share">SHARE TEXT</button>
      <button type="button" data-action="selection-add">ADD TO BATCH</button>
    </div>
    <div class="hidn-selection-tools__batch" data-selection-batch hidden>
      <span data-selection-batch-count>0 SELECTED</span>
      <button type="button" data-action="selection-batch-share">SHARE BATCH</button>
      <button type="button" data-action="selection-batch-clear">CLEAR</button>
    </div>
    <p class="hidn-selection-tools__status" data-selection-status role="status" aria-live="polite"></p>
  </aside>`;
}

function publicFrame(path: string, main: string, pageClass = ""): string {
  const normalizedPath = normalizePath(path);
  const isHome = normalizedPath === "/";
  const isRoomCreation = normalizedPath === "/room/access";
  const isHowItWorks = normalizedPath === "/how-it-works";
  const isRoomSurface = normalizedPath === "/room" || normalizedPath === "/explore" || normalizedPath === "/confess" || normalizedPath.startsWith("/c/");
  const isPointerSurface = !isHome && !isRoomCreation && !isRoomSurface;
  const footerLinks = isHome || isRoomCreation
    ? [{ label: "HOW IT WORKS", href: "/how-it-works" }]
    : isHowItWorks
      ? [{ label: "HOME", href: "/" }]
    : isRoomSurface
      ? [
          { label: "HOW IT WORKS", href: "/how-it-works" },
          { label: "LOG OUT", href: "/" },
        ]
    : [
        { label: "THE ROOM", href: "/room" },
        { label: "HOW IT WORKS", href: "/how-it-works" },
        { label: "MANIFESTO", href: "/manifesto" },
        { label: "PRIVACY", href: "/privacy" },
      ];

  return `<div class="public-page ${pageClass} fx-grain fx-vignette${isPointerSurface ? " hidn-pointer-surface" : ""}"${isPointerSurface ? " data-pointer-surface" : ""}>
    <a class="skip-link" href="#main-content">Skip to content</a>
    ${isPointerSurface ? renderPointerSpotlight() : ""}
    ${isHome ? "" : publicWindowChrome(path, isRoomSurface)}
    ${isRoomSurface ? "" : publicNavigation(path)}
    ${main}
    ${isRoomSurface ? renderSelectionTools() : ""}
    ${isRoomSurface ? "" : FooterShell({
      links: footerLinks,
      identity: isRoomCreation || isHowItWorks ? "" : "ANONYMOUS BY DESIGN.",
    })}
  </div>`;
}

function flowStepper(currentStep: FlowStep): string {
  const steps: Array<{ key: FlowStep; number: string; label: string }> = [
    { key: "prove", number: "01", label: "PROVE" },
    { key: "confess", number: "02", label: "CONFESS" },
    { key: "preview", number: "03", label: "PREVIEW" },
  ];
  const currentIndex = steps.findIndex((step) => step.key === currentStep);

  return `<ol class="flow-stepper" aria-label="Confession steps">
    ${steps
      .map((step, index) => {
        const state =
          index < currentIndex || currentStep === "success"
            ? "complete"
            : index === currentIndex
              ? "current"
              : "upcoming";
        return `<li class="flow-step flow-step--${state}">
          <span class="flow-step__number">${step.number}</span>
          <span class="flow-step__label">${step.label}</span>
        </li>`;
      })
      .join("")}
  </ol>`;
}

function proofStateCopy(state: ProofState): { label: string; copy: string } {
  switch (state) {
    case "preparing":
      return { label: "PREPARING PRIVATE CHECK...", copy: "Setting up the local demo sequence." };
    case "generating":
      return { label: "GENERATING PROOF...", copy: "Simulating a short proof handoff." };
    case "verifying":
      return { label: "VERIFYING...", copy: "Checking the mock result locally." };
    case "verified":
      return { label: "✓ VERIFIED / MOCK", copy: "The visual sequence is complete. No cryptographic proof was created." };
    default:
      return { label: "READY TO BEGIN", copy: "A short local demonstration of the future flow." };
  }
}

function renderProofStep(): string {
  const stateCopy = proofStateCopy(mockFlow.proofState);

  return `<section class="flow-panel flow-proof" aria-labelledby="flow-title">
    <div class="flow-panel__eyebrow">
      ${TerminalLabel("HIDN / PRIVATE CHANNEL")}
      ${StatusIndicator("MOCK / LOCAL ONLY", "warning")}
    </div>
    <h1 id="flow-title" class="type-display-lg">PRIVATE CHECK</h1>
    <p class="flow-panel__lead">Proving you can participate without revealing who you are.</p>
    <div class="flow-status" role="status" aria-live="polite">
      <span class="flow-status__line">${escapeHtml(stateCopy.label)}</span>
      <span class="flow-status__copy">${escapeHtml(stateCopy.copy)}</span>
    </div>
    <div class="flow-proof__action">
      ${
        mockFlow.proofState === "idle"
          ? PrimaryButton({ label: "PROVE PRIVATELY →", dataAction: "proof-start" })
          : mockFlow.proofState === "verified"
            ? PrimaryButton({ label: "CONTINUE TO CONFESSION →", dataAction: "proof-continue" })
          : PrimaryButton({ label: "WORKING...", disabled: true })
      }
    </div>
    <p class="flow-mock-note">SIMULATED / NO CRYPTOGRAPHIC PROOF CREATED.</p>
  </section>`;
}

function renderConfessStep(): string {
  return `<section class="flow-panel flow-confess" aria-labelledby="flow-title">
    <div class="flow-panel__eyebrow">
      ${TerminalLabel("HIDN / PRIVATE CHANNEL")}
      ${PrivacyBadge("NO ACCOUNT")}
    </div>
    <h1 id="flow-title" class="type-display-lg">WRITE THE THOUGHT</h1>
    <p class="flow-panel__lead">No name. No profile. Just the message.</p>
    ${mockFlow.error ? AlertMessage("MESSAGE NEEDED", mockFlow.error, "danger") : ""}
    <form class="flow-form" id="confession-form" novalidate>
      ${TextArea({
        id: "confession-thought",
        label: "Message",
        value: mockFlow.thought,
        placeholder: "What's on your mind?",
        hint: "This local demo keeps the draft in memory only.",
        rows: 8,
        required: true,
      })}
      <div class="flow-form__controls">
        ${SelectControl({
          id: "confession-category",
          label: "Category",
          value: mockFlow.category,
          options: categoryOptions,
          hint: "A broad label, not a profile.",
        })}
        <div class="flow-visibility">
          <span class="ui-field__label">Visibility</span>
          ${VisibilityToggle("MINIMAL VISIBILITY")}
          <p>Thought, category, reaction count, and relative time only.</p>
        </div>
      </div>
      <div class="flow-form__footer">
        <p class="flow-form__reassurance">NO ACCOUNT · NO USERNAME · NO HISTORY</p>
        ${PrimaryButton({ label: "CONTINUE →", dataAction: "confess-continue" })}
      </div>
    </form>
  </section>`;
}

function renderPreviewStep(): string {
  return `<section class="flow-panel flow-preview" aria-labelledby="flow-title">
    <div class="flow-panel__eyebrow">
      ${TerminalLabel("HIDN / PRIVATE CHANNEL")}
      ${PrivacyBadge("IDENTITYLESS")}
    </div>
    <h1 id="flow-title" class="type-display-lg">PREVIEW THE MESSAGE</h1>
    <p class="flow-panel__lead">This is exactly how it will appear. No identity. No history.</p>
    <div class="flow-preview__message">
      ${renderPreviewTransmission()}
    </div>
    <dl class="flow-summary" aria-label="Privacy summary">
      <div><dt>IDENTITY</dt><dd>HIDN</dd></div>
      <div><dt>USERNAME</dt><dd>NONE</dd></div>
      <div><dt>PROFILE</dt><dd>NONE</dd></div>
      <div><dt>HISTORY</dt><dd>NONE</dd></div>
    </dl>
    ${SystemMessage("FINAL CHECK / MOCK ONLY", "Posting here adds a local in-memory demo confession. No backend or persistent record is connected.", "DEMO")}
    <div class="flow-actions">
      ${SecondaryButton({ label: "EDIT", dataAction: "confession-edit" })}
      ${PrimaryButton({ label: "POST CONFESSION →", dataAction: "confession-post" })}
    </div>
  </section>`;
}

function renderSuccessStep(): string {
  const confessionId = mockFlow.createdId ?? "";
  return `<section class="flow-success" aria-labelledby="flow-title">
    <div class="flow-success__copy">
      ${TerminalLabel("TRANSMISSION COMPLETE")}
      ${StatusIndicator("LOCAL MOCK / RECEIVED", "warning")}
      <h1 id="flow-title" class="type-display-lg">CONFESSION POSTED</h1>
      <p class="flow-panel__lead">The message stays. You don't.</p>
      <p class="flow-success__note">This demo keeps the new confession in memory for this browser session only. No identity, account, or history was created.</p>
      <div class="flow-actions">
        ${actionLink("VIEW →", confessionId ? `/c/${confessionId}` : "/room", "primary")}
        ${GhostButton({ label: "LEAVE →", dataAction: "leave-hidn" })}
      </div>
    </div>
  </section>`;
}

function renderConfess(): string {
  const content =
    mockFlow.step === "success"
      ? renderSuccessStep()
      : mockFlow.step === "confess"
        ? renderConfessStep()
        : mockFlow.step === "preview"
          ? renderPreviewStep()
          : renderProofStep();

  return publicFrame(
    "/confess",
    `<main id="main-content" class="public-main flow-main">
      <div class="hidn-container flow-page">
        <header class="flow-header">
          ${TerminalLabel("HIDN / PRIVATE TRANSMISSION")}
          <p>PRIVATE CHANNEL / LOCAL MOCK</p>
        </header>
        ${flowStepper(mockFlow.step)}
        ${content}
      </div>
    </main>`,
    "public-page--flow",
  );
}

function roomChannelOption(key: RoomChannel): (typeof roomChannelOptions)[number] {
  return roomChannelOptions.find((channel) => channel.key === key) ?? roomChannelOptions[0];
}

function feedForRoomChannel(confessions: MockConfession[]): MockConfession[] {
  const channel = roomChannelOption(activeRoomChannel);
  if (!channel.categories) {
    return confessions;
  }

  return confessions.filter((confession) => channel.categories?.includes(confession.category));
}

function feedForTab(tab: FeedTab): MockConfession[] {
  let confessions: MockConfession[];
  if (tab === "felt") {
    confessions = [...MOCK_CONFESSIONS].sort((left, right) => right.reactions - left.reactions);
  } else if (tab === "random") {
    confessions = [...MOCK_CONFESSIONS.slice(4), ...MOCK_CONFESSIONS.slice(0, 4)];
  } else {
    confessions = MOCK_CONFESSIONS;
  }

  return feedForRoomChannel(confessions);
}

function renderTransmissionRows(tab: FeedTab): string {
  const confessions = feedForTab(tab);
  if (!confessions.length) {
    return EmptyState("NO TRANSMISSIONS", "Nothing is visible here yet.");
  }

  return confessions
    .map((confession) => renderTransmissionRow(transmissionViewFromConfession(confession), { href: `/c/${confession.id}` }))
    .join("");
}

function renderExploreTabs(): string {
  const tabs: Array<{ key: FeedTab; label: string }> = [
    { key: "latest", label: "LATEST" },
    { key: "random", label: "RANDOM" },
    { key: "felt", label: "FELT" },
  ];

  return `<div class="explore-tabs" role="tablist" aria-label="Confession order">
    ${tabs
      .map(
        (tab) => `<button class="explore-tabs__tab" type="button" role="tab" data-feed-tab="${tab.key}" aria-selected="${activeFeedTab === tab.key}">${tab.label}</button>`,
      )
      .join("")}
  </div>`;
}

function renderRoomDirectory(): string {
  const activeChannel = roomChannelOption(activeRoomChannel);
  const folderGroups: Array<{ key: string; label: string; channels: typeof roomChannelOptions; open: boolean }> = [
    {
      key: "discussion",
      label: "DISCUSSION ROOMS",
      channels: roomChannelOptions.filter((channel) => channel.key !== "general"),
      open: true,
    },
    {
      key: "system",
      label: "SYSTEM CHANNELS",
      channels: roomChannelOptions.filter((channel) => channel.key === "general"),
      open: activeRoomChannel === "general",
    },
  ];

  return `<aside class="room-directory" aria-label="Discussion rooms">
    <div class="room-directory__header">
      ${TerminalLabel("ROOM INDEX / OPEN CHANNELS")}
      <span class="room-directory__count">${roomChannelOptions.length} ROOMS</span>
    </div>
    <h2>Find your room.</h2>
    <p class="room-directory__intro">Every channel is a shared wall. No handles, no member list, no public identity.</p>
    <div class="room-directory__tree" role="tree" aria-label="Room folders">
      ${folderGroups
        .map(
          (folder) => `<section class="room-directory__folder${folder.open ? " room-directory__folder--open" : ""}">
            <button class="room-directory__folder-toggle" type="button" data-room-folder-toggle="${folder.key}" aria-expanded="${folder.open}" aria-controls="room-folder-${folder.key}">
              <span class="room-directory__folder-caret" aria-hidden="true">${folder.open ? "▾" : "▸"}</span>
              <span class="room-directory__folder-icon" aria-hidden="true"></span>
              <strong>${folder.label}</strong>
              <small>${String(folder.channels.length).padStart(2, "0")}</small>
            </button>
            <div class="room-directory__folder-children" id="room-folder-${folder.key}" role="group"${folder.open ? "" : " hidden"}>
              ${folder.channels
                .map((channel, index) => `<button class="room-directory__room${activeRoomChannel === channel.key ? " room-directory__room--active" : ""}" type="button" data-room-channel="${channel.key}" aria-pressed="${activeRoomChannel === channel.key}">
                  <span class="room-directory__room-number">${String(index + 1).padStart(2, "0")}</span>
                  <span class="room-directory__room-copy"><strong>${channel.label}</strong><small>${channel.description}</small></span>
                  <span class="room-directory__room-arrow" aria-hidden="true">↗</span>
                </button>`)
                .join("")}
            </div>
          </section>`,
        )
        .join("")}
    </div>
    <div class="room-directory__footer">
      <span>ACTIVE CHANNEL</span><strong>// ${activeChannel.label}</strong>
      ${roomChannelNotice ? `<p role="status">${escapeHtml(roomChannelNotice)}</p>` : ""}
      ${SecondaryButton({ label: "CREATE A ROOM →", dataAction: "room-create-channel" })}
    </div>
  </aside>`;
}

function renderExplore(path = "/room"): string {
  return publicFrame(
    path,
    `<main id="main-content" class="public-main explore-main">
      <div class="hidn-container--wide explore-page">
        <header class="explore-header">
          ${TerminalLabel("PRIVATE ROOM / OPEN THREADS")}
          <h1 class="type-display-lg">THE ROOM</h1>
          <p>Thoughts move through the room without names. Follow one thread or leave one behind.</p>
        </header>
        <div class="explore-layout">
          <section class="explore-feed" aria-labelledby="explore-feed-title">
            <div class="explore-feed__heading">
              <div>
                ${TerminalLabel("RECEIVING / ANONYMOUS SIGNAL")}
                <h2 id="explore-feed-title" class="type-heading-2">// ${escapeHtml(roomChannelOption(activeRoomChannel).label)} / THOUGHTS IN MOTION</h2>
              </div>
              ${StatusIndicator("LOCAL THREAD / LIVE FEEL", "warning", true)}
            </div>
            ${renderExploreTabs()}
            <div class="explore-feed__list" id="explore-feed-list" aria-live="polite">${renderTransmissionRows(activeFeedTab)}</div>
          </section>
          ${renderRoomDirectory()}
        </div>
      </div>
    </main>`,
    "public-page--explore",
  );
}

function renderThreadRoom(id: string, quotedText = ""): string {
  const replies = repliesForThread(id);
  const replyCount = replies.length;
  const messages = replyCount
    ? replies
        .map(
          (reply, index) => `<article class="thread-room__message">
            <header><span>ANONYMOUS / ${String(index + 1).padStart(2, "0")}</span><time>${escapeHtml(reply.time)}</time></header>
            <p data-share-text data-share-id="${escapeHtml(id)}" data-share-kind="reply" data-share-index="${index}" data-share-label="${escapeHtml(`REPLY / ${String(index + 1).padStart(2, "0")}`)}" data-share-category="IDENTITY" data-share-time="${escapeHtml(reply.time)}">${escapeHtml(reply.text)}</p>
            <footer class="thread-room__message-actions">
              <button class="room-message__action" type="button" data-action="thread-save-image" data-thread-id="${escapeHtml(id)}" data-reply-index="${index}">SAVE IMAGE</button>
              <button class="room-message__action" type="button" data-action="thread-share-image" data-thread-id="${escapeHtml(id)}" data-reply-index="${index}">SHARE IMAGE</button>
              <span class="thread-share-status" data-share-status="${escapeHtml(`${id}:reply:${index}`)}" role="status" aria-live="polite"></span>
            </footer>
          </article>`,
        )
        .join("")
    : `<p class="thread-room__empty">No replies yet. Leave the first signal in the room.</p>`;

  return `<section class="thread-room" data-thread-root="${escapeHtml(id)}" aria-labelledby="thread-room-title">
    <header class="thread-room__header">
      <div>
        ${TerminalLabel("THREAD / WITHOUT NAMES")}
        <h2 id="thread-room-title">KEEP THE THOUGHT MOVING.</h2>
      </div>
      <span class="thread-room__signal"><i aria-hidden="true"></i> ${replyCount ? `RECEIVING / ${replyCount}` : "OPEN CHANNEL"}</span>
    </header>
    ${quotedText ? `<blockquote class="thread-room__quote" data-share-text data-share-id="${escapeHtml(id)}" data-share-kind="thread" data-share-label="ORIGINAL THREAD" data-share-category="IDENTITY" data-share-time="NOW">“${escapeHtml(quotedText)}”</blockquote>` : ""}
    <div class="thread-room__messages" aria-live="polite">${messages}</div>
    <form class="thread-room__composer" novalidate>
      <label class="ui-field thread-room__field" for="thread-reply-${escapeHtml(id)}">
        <span class="ui-field__label">QUOTE / REPLY WITHOUT A NAME</span>
        <textarea id="thread-reply-${escapeHtml(id)}" data-thread-input rows="4" placeholder="Add your thought to the thread..."></textarea>
      </label>
      <div class="thread-room__composer-footer">
        <span>NO HANDLE / NO PROFILE / NO TRAIL</span>
        ${PrimaryButton({ label: "TRANSMIT REPLY →", dataAction: "thread-reply" })}
      </div>
    </form>
    <p class="thread-room__note">LOCAL DEMO THREAD. A production room would stream anonymous replies from the backend without attaching a public identity.</p>
  </section>`;
}

function renderDetail(id: string): RenderedProductRoute {
  const confession = getMockConfession(id);
  const metadata: HidnMetadata = {
    kind: "anonymous-confession",
    title: "HIDN — Anonymous confession",
    description: "An anonymous HIDN confession. No public identity or confession history is attached.",
    canonicalPath: `/c/${encodeURIComponent(id)}`,
  };

  if (!confession) {
    return {
      metadata,
      html: publicFrame(
        `/c/${id}`,
        `<main id="main-content" class="public-main detail-main">
          <div class="hidn-container--reading detail-page">
            <h1 class="detail-page__title">TRANSMISSION NOT FOUND</h1>
            ${ErrorState("TRANSMISSION NOT FOUND", "This local demo confession is no longer available in memory.")}
            ${actionLink("BACK TO THE ROOM", "/room", "secondary")}
          </div>
        </main>`,
        "public-page--detail",
      ),
    };
  }

  return {
    metadata,
    html: publicFrame(
      `/c/${id}`,
        `<main id="main-content" class="public-main detail-main">
        <div class="hidn-container--reading detail-page">
          <header class="detail-header">
            ${TerminalLabel("ANONYMOUS TRANSMISSION")}
            <h1 class="detail-page__title">ANONYMOUS CONFESSION</h1>
            <div class="detail-header__meta"><span>${escapeHtml(confession.reference)}</span><time datetime="${escapeHtml(confession.time)}">${escapeHtml(confession.relativeTime)}</time></div>
          </header>
          <article class="detail-card" aria-labelledby="detail-thought">
            <p id="detail-thought" class="detail-card__thought" data-share-text data-share-id="${escapeHtml(confession.id)}" data-share-kind="thread" data-share-label="${escapeHtml(confession.reference)}" data-share-category="${escapeHtml(confession.category)}" data-share-time="${escapeHtml(confession.time)}">“${escapeHtml(confession.text)}”</p>
            <div class="detail-card__footer">
              ${CategoryTag(confession.category)}
              ${PrivacyBadge("NO IDENTITY")}
            </div>
          </article>
          <div class="detail-meta-grid">
            <div><span>LIKES</span><strong>${escapeHtml(String(reactionCountForThread(confession.id, confession.reactions)))}</strong></div>
            <div><span>COMMENTS</span><strong>${escapeHtml(String(repliesForThread(confession.id).length))}</strong></div>
            <div><span>POSTED</span><strong>${escapeHtml(confession.relativeTime)}</strong></div>
          </div>
          ${SystemMessage("PROOF STATUS / DEMO ONLY", "The public card contains no proof material. This mock route does not verify a person or connect a network identity.", "DEMO")}
          <div class="detail-actions" aria-label="Confession actions">
            <button class="room-message__action" type="button" data-action="room-like" data-thread-id="${escapeHtml(confession.id)}" aria-pressed="${roomLikedIds.has(confession.id)}">♡ ${escapeHtml(String(reactionCountForThread(confession.id, confession.reactions)))}</button>
            <a class="room-message__action" href="#thread-reply-${escapeHtml(confession.id)}">COMMENTS ${escapeHtml(String(repliesForThread(confession.id).length))}</a>
            <a class="room-message__action" href="#thread-reply-${escapeHtml(confession.id)}">QUOTE</a>
            <button class="room-message__action" type="button" data-action="thread-save-image" data-thread-id="${escapeHtml(confession.id)}">SAVE IMAGE</button>
            <button class="room-message__action" type="button" data-action="thread-share-image" data-thread-id="${escapeHtml(confession.id)}">SHARE IMAGE</button>
            <button class="room-message__action" type="button" data-action="thread-x-share" data-thread-id="${escapeHtml(confession.id)}">X / POST</button>
            <button class="room-message__action" type="button" data-demo="true">REPORT</button>
          </div>
          <p class="thread-share-status thread-share-status--detail" data-share-status="${escapeHtml(confession.id)}" role="status" aria-live="polite"></p>
          ${renderThreadRoom(confession.id, confession.text)}
          <p class="detail-boundary">NO PROFILE / NO AUTHOR PAGE / NO MORE FROM THIS PERSON</p>
          ${actionLink("BACK TO THE ROOM", "/room", "ghost", "detail-back")}
        </div>
      </main>`,
      "public-page--detail",
    ),
  };
}

function createRoomDemoId(): string {
  const bytes = new Uint8Array(4);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    bytes.forEach((_, index) => {
      bytes[index] = Math.floor(Math.random() * 256);
    });
  }

  return `HIDN-DEMO-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function clearRoomSession(): void {
  sessionStorage.removeItem("hidn:room:secret");
  sessionStorage.removeItem("hidn:room:backend-id");
  sessionStorage.removeItem("hidn:room:entered");
  sessionStorage.removeItem("hidn:room:verified");
  roomAccessMode = "choose";
  roomDemoId = "";
  roomDemoMemo = "";
  roomLoginError = "";
  roomBackendStatus = "local";
}

function renderRoomAccessChooser(): string {
  return `<div class="room-access-page">
    <header class="room-access-header">
      ${TerminalLabel("HIDN / ROOM ACCESS")}
      <h1 class="type-display-lg room-access-header__title">ENTER THE<br /><em>PRIVATE ROOM.</em></h1>
      <p class="room-access-header__copy">No names. No profile. Choose how you want to cross the threshold.</p>
    </header>
    <div class="room-access-options">
      <article class="room-access-option">
        <span class="room-access-option__number">01</span>
        <div>
          <h2>CREATE AN ID</h2>
          <p>Set up a nameless room identity. The Worker generates a unique access code and stores its verification record in D1.</p>
        </div>
        ${PrimaryButton({ label: "CREATE ID →", dataAction: "room-create" })}
      </article>
      <article class="room-access-option">
        <span class="room-access-option__number">02</span>
        <div>
          <h2>LOG IN WITH ID</h2>
          <p>Use the private room ID or access key you already hold. No email, username, or recovery account.</p>
        </div>
        ${SecondaryButton({ label: "USE MY ID →", dataAction: "room-login" })}
      </article>
    </div>
    ${SystemMessage("D1 WORKER / LIVE CREDENTIALS", "Create an ID to receive a unique access code. You will need that code to log in from this or another browser.", "LIVE")}
  </div>`;
}

function renderRoomCreate(): string {
  const memo = roomDemoMemo || "HIDN-ROOM-PENDING";
  const verifyLabel = roomBackendStatus === "connecting"
    ? "CREATING ACCESS CODE..."
    : roomBackendStatus === "connected"
      ? "VERIFY DEMO PAYMENT →"
      : "WORKER UNAVAILABLE";

  return `<div class="room-access-page">
    <header class="room-access-header room-access-header--compact">
      ${TerminalLabel("HIDN / CREATE ID")}
      <h1 class="type-display-lg room-access-header__title">FUND THE<br /><em>THRESHOLD.</em></h1>
      <p class="room-access-header__copy">The Worker has created your D1-backed room record. Complete the demo handoff, then save the access code it returns.</p>
    </header>
    <div class="room-access-stepbar" aria-label="Create ID steps">
      <span class="room-access-stepbar__step room-access-stepbar__step--current">01 / SEND</span>
      <span class="room-access-stepbar__step">02 / MEMO</span>
      <span class="room-access-stepbar__step">03 / ID</span>
    </div>
    <section class="room-payment-card" aria-labelledby="room-payment-title">
      <div class="room-payment-card__header">
        <span class="room-payment-card__eyebrow">DEMO DESTINATION / NOT LIVE</span>
        <span class="room-payment-card__status"><span aria-hidden="true"></span>${escapeHtml(roomBackendStatusLabel())}</span>
      </div>
      <h2 id="room-payment-title">SHIELDED PAYMENT</h2>
      <p class="room-payment-card__explainer">A Zcash payment designed to keep its transaction details away from the public chain. HIDN would use it as a one-time anti-spam gate—not as your password or identity.</p>
      <code class="room-payment-card__address">zs1demo-room-vault-not-live</code>
      <div class="room-payment-card__details">
        <div><span>USD TARGET</span><strong>$1.00</strong></div>
        <div><span>ZEC AMOUNT / LIVE RATE</span><strong data-room-zec-amount>${escapeHtml(roomZecAmount)}</strong></div>
      </div>
      <p class="room-payment-card__rate" data-room-rate-status>${escapeHtml(roomZecRateStatus)}</p>
      <p class="room-payment-card__memo"><strong>MEMO REFERENCE</strong> <code>${escapeHtml(memo)}</code><br />A one-time receipt code lets the backend match a payment to this room request. It is not a secret, room ID, or recovery phrase.</p>
      <label class="room-access-field" for="room-return-address">
        <span>SHIELDED RETURN ADDRESS / DEMO</span>
        <input id="room-return-address" type="text" placeholder="zs1... / not connected" autocomplete="off" spellcheck="false" />
      </label>
      <p class="room-payment-card__note">In production, a wallet would send the amount and memo to the room vault, then receive a privacy-preserving credential at the return address. Never place a secret or recovery phrase in a memo.</p>
    </section>
    ${roomLoginError ? AlertMessage("WORKER RESPONSE", roomLoginError, "danger") : ""}
    ${SystemMessage("PAYMENT DEMO / D1 LIVE", "The payment verification control is still a demo step, but the access code and login check are real Worker + D1 operations.", "LIVE")}
    <div class="room-access-actions">
      ${GhostButton({ label: "← BACK", dataAction: "room-back" })}
      ${PrimaryButton({ label: verifyLabel, disabled: roomBackendStatus !== "connected", dataAction: "room-verify-demo" })}
    </div>
  </div>`;
}

function renderRoomLogin(): string {
  return `<div class="room-access-page">
    <header class="room-access-header room-access-header--compact">
      ${TerminalLabel("HIDN / ID LOGIN")}
      <h1 class="type-display-lg room-access-header__title">RETURN TO<br /><em>THE ROOM.</em></h1>
      <p class="room-access-header__copy">Enter the access code issued by the HIDN Worker. Without a verified code, the room stays closed.</p>
    </header>
    ${roomLoginError ? AlertMessage("ID NEEDED", roomLoginError, "danger") : ""}
    <form class="room-login-card" novalidate>
      <label class="room-access-field" for="room-login-id">
        <span>ROOM ACCESS CODE</span>
        <input id="room-login-id" type="text" placeholder="HIDN-XXXX-..." autocomplete="off" spellcheck="false" />
      </label>
      <p class="room-payment-card__note">The Worker hashes the code before checking D1. The plaintext code is never stored in the database.</p>
      <div class="room-access-actions">
        ${GhostButton({ label: "← BACK", dataAction: "room-back" })}
        ${PrimaryButton({ label: "ENTER ROOM →", dataAction: "room-submit-login" })}
      </div>
    </form>
  </div>`;
}

function renderRoomReady(): string {
  const demoId = roomDemoId || "NO CODE ISSUED";

  return `<div class="room-access-page room-access-page--ready">
    <header class="room-access-header room-access-header--compact">
      ${TerminalLabel("HIDN / ACCESS READY")}
      <h1 class="type-display-lg room-access-header__title">THE KEY STAYS<br /><em>WITH YOU.</em></h1>
      <p class="room-access-header__copy">The Worker issued this code and D1 stores only its hash. Keep the plaintext code on your side and use it to log in again.</p>
    </header>
    <div class="room-access-key">
      <span class="room-access-key__label">D1 ACCESS CODE / SAVE THIS</span>
      <code>${escapeHtml(demoId)}</code>
      <span class="room-access-key__warning">The Worker generated this code. D1 stores only its hash. Use this exact code to log in again.</span>
    </div>
    ${SystemMessage("D1 VERIFICATION COMPLETE", "Your room access record is verified. The Zcash payment step remains a demo until a wallet watcher is connected.", "LIVE")}
    <div class="room-access-actions">
      ${GhostButton({ label: "START OVER", dataAction: "room-back" })}
      ${PrimaryButton({ label: "ENTER ROOM →", dataAction: "room-enter" })}
    </div>
  </div>`;
}

function renderRoomAccess(): RenderedProductRoute {
  const content =
    roomAccessMode === "create"
      ? renderRoomCreate()
      : roomAccessMode === "login"
        ? renderRoomLogin()
        : roomAccessMode === "ready"
          ? renderRoomReady()
          : renderRoomAccessChooser();

  return {
    metadata: ROOM_METADATA,
    html: publicFrame(
      "/room/access",
      `<main id="main-content" class="public-main room-main room-access-main hidn-pointer-surface" data-pointer-surface>
        <div class="room-access-atmosphere" aria-hidden="true">
          ${renderPointerSpotlight()}
          <div class="room-access-atmosphere__cards">${renderHomeRoomCards(6)}</div>
        </div>
        ${content}
      </main>`,
      "public-page--room",
    ),
  };
}

interface PlaceholderPage {
  eyebrow: string;
  title: string;
  copy: string;
  body: string;
}

function placeholderForPath(path: string): PlaceholderPage {
  if (path === "/manifesto") {
    return {
      eyebrow: "HIDN / MANIFESTO",
      title: "SHOW THE THOUGHT. HIDE THE PERSON.",
      copy: "A public surface for saying the thing without turning the person into content.",
      body: "HIDN treats anonymity as a boundary, not a personality. The message can be seen without requiring a name, a profile, or a trail to follow.",
    };
  }

  if (path === "/privacy") {
    return {
      eyebrow: "HIDN / PRIVACY",
      title: "REVEAL LESS BY DEFAULT.",
      copy: "Privacy language should stay concrete, limited, and understandable.",
      body: "This Phase 2 experience is a local mock. It creates no account, requests no wallet, makes no cryptographic proof, and stores no confession beyond the current browser memory.",
    };
  }

  return {
    eyebrow: "HIDN / HOW IT WORKS",
    title: "THE PERSON STAYS OUT OF FRAME.",
    copy: "Visit, write, preview, and leave without becoming a public identity.",
    body: "The public flow is intentionally small: a private-proof placeholder, a confession composer, an identityless preview, and a quiet posting result. The current experience is a frontend demonstration only.",
  };
}

function renderPlaceholder(path: string): RenderedProductRoute {
  const page = placeholderForPath(path);
  const title = path === "/manifesto" ? "Manifesto" : path === "/privacy" ? "Privacy" : "How it works";
  return {
    metadata: {
      kind: "public-page",
      title: `HIDN — ${title}`,
      description: page.copy,
      canonicalPath: path,
    },
    html: publicFrame(
      path,
      `<main id="main-content" class="public-main placeholder-main">
        <div class="hidn-container--reading placeholder-page">
          <header class="ui-section-header placeholder-header">
            ${TerminalLabel(page.eyebrow)}
            <h1 class="placeholder-header__title">${escapeHtml(page.title)}</h1>
            <p class="ui-section-header__copy">${escapeHtml(page.copy)}</p>
          </header>
          <div class="placeholder-content">
            ${ManifestoStatement(path === "/privacy" ? "Concrete controls. No absolute promises." : "Presence without exposure.")}
            <p class="type-body-lg">${escapeHtml(page.body)}</p>
          </div>
          ${
            path === "/how-it-works"
              ? `<ol class="placeholder-steps">
                <li><span>01</span><div><strong>PROVE PRIVATELY</strong><p>Future eligibility and proof work will be reviewed before it becomes real.</p></div></li>
                <li><span>02</span><div><strong>CONFESS</strong><p>Write the thought with no account, username, or profile.</p></div></li>
                <li><span>03</span><div><strong>POST ANONYMOUSLY</strong><p>Preview exactly what is shown, then leave the surface behind.</p></div></li>
              </ol>`
              : SystemMessage("PHASE 2 / FRONTEND DEMO", "Backend persistence, real proof, moderation, wallets, and analytics remain deferred.", "INFO")
          }
        </div>
      </main>`,
      `public-page--placeholder${path === "/how-it-works" ? " public-page--how-it-works" : ""}`,
    ),
  };
}

function renderNotFound(): RenderedProductRoute {
  return {
    metadata: {
      kind: "not-found",
      title: "HIDN — Surface unavailable",
      description: "The requested HIDN surface is not available.",
      canonicalPath: "/",
    },
    html: publicFrame(
      "/",
      `<main id="main-content" class="public-main detail-main">
        <div class="hidn-container--reading detail-page">
          <h1 class="detail-page__title">SURFACE UNAVAILABLE</h1>
          ${ErrorState("SURFACE UNAVAILABLE", "The requested HIDN page is not part of this public experience.")}
          ${actionLink("RETURN TO HIDN", "/", "primary")}
        </div>
      </main>`,
      "public-page--detail",
    ),
  };
}

function renderHome(): RenderedProductRoute {
  return {
    metadata: HOME_METADATA,
    html: publicFrame(
      "/",
      `<main id="main-content" class="public-main home-main">
        <section class="home-room-stage hidn-pointer-surface" data-pointer-surface aria-labelledby="home-room-title">
          <div class="home-room-stars" aria-hidden="true"></div>
          <div class="home-room-noise" aria-hidden="true"></div>
          ${renderPointerSpotlight()}
          <div class="home-room-window">
            <div class="home-room-window__bar">
              <div class="home-room-window__controls">
                <span class="home-room-window__control home-room-window__control--close"></span>
                <span class="home-room-window__control home-room-window__control--minimize"></span>
                <span class="home-room-window__control home-room-window__control--maximize"></span>
              </div>
              <span class="home-room-window__title">HIDN://PRIVATE_ROOM</span>
              <div class="home-room-window__right">
                <button class="home-room-audio-toggle" id="home-audio-toggle" type="button" aria-pressed="false" aria-label="Toggle ambient room sound">
                  <span class="home-room-audio-toggle__label">SIGNAL</span>
                  <span data-home-audio-label>OFF</span>
                </button>
                ${renderVisitorTimeSignal("home-room-window__meta")}
              </div>
            </div>
          </div>
          <div class="home-room-card-field" aria-hidden="true">
            ${renderHomeRoomCards()}
          </div>
          <div class="home-room-core">
            <p class="home-room-core__eyebrow">${TerminalLabel("HIDN / PRIVATE ROOM")}</p>
            <h1 id="home-room-title">A ROOM<br />WITHOUT <em>NAMES.</em></h1>
            <p class="home-room-core__copy">A room for anonymous thoughts and unnamed conversations.</p>
            <a class="ui-button ui-button--primary home-room-enter" href="/room/access" data-glitch-text="> ENTER ROOM" aria-label="ENTER ROOM">
              <span class="home-room-enter__prompt" aria-hidden="true">&gt;</span><span>ENTER ROOM</span><span class="home-room-enter__cursor" aria-hidden="true">_</span>
            </a>
            <p class="home-room-core__status">LOCAL MOCK ROOM / NO LIVE USERS</p>
          </div>
        </section>
      </main>`,
      "public-page--home",
    ),
  };
}

export function renderProductRoute(path: string): RenderedProductRoute {
  const normalizedPath = normalizePath(path);

  if (normalizedPath === "/") {
    return renderHome();
  }

  if (normalizedPath === "/room") {
    return { metadata: EXPLORE_METADATA, html: renderExplore("/room") };
  }

  if (normalizedPath === "/room/access") {
    return renderRoomAccess();
  }

  if (normalizedPath === "/confess") {
    return { metadata: CONFESS_METADATA, html: renderConfess() };
  }

  if (normalizedPath === "/explore") {
    window.history.replaceState({}, "", "/room");
    return { metadata: EXPLORE_METADATA, html: renderExplore("/room") };
  }

  if (["/manifesto", "/how-it-works", "/privacy"].includes(normalizedPath)) {
    return renderPlaceholder(normalizedPath);
  }

  if (normalizedPath.startsWith("/c/")) {
    const id = normalizedPath.slice(3).split("/")[0];
    if (id) {
      try {
        return renderDetail(decodeURIComponent(id));
      } catch {
        return renderDetail(id);
      }
    }
  }

  return renderNotFound();
}

function rerenderProductRoute(): void {
  window.dispatchEvent(new CustomEvent("hidn:rerender"));
}

function navigateProductRoute(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event("popstate"));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function runMockProof(): Promise<void> {
  if (proofRunActive || mockFlow.proofState !== "idle") {
    return;
  }

  proofRunActive = true;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const states: Array<{ state: ProofState; wait: number }> = [
    { state: "preparing", wait: 250 },
    { state: "generating", wait: 300 },
    { state: "verifying", wait: 300 },
    { state: "verified", wait: 0 },
  ];

  for (const item of states) {
    if (normalizePath(window.location.pathname) !== "/confess" || mockFlow.step !== "prove") {
      proofRunActive = false;
      return;
    }

    mockFlow.proofState = item.state;
    rerenderProductRoute();
    await delay(reducedMotion ? Math.min(item.wait, 30) : item.wait);
  }

  proofRunActive = false;
}

function startHomeConfession(root: ParentNode): void {
  const textarea = root.querySelector<HTMLTextAreaElement>("#home-confession-thought");
  const error = root.querySelector<HTMLElement>("[data-home-error]");
  const thought = textarea?.value.trim() ?? "";

  if (!thought) {
    if (error) {
      error.hidden = false;
      error.textContent = "Write a thought before transmitting.";
    }
    textarea?.focus();
    return;
  }

  mockFlow.thought = thought;
  mockFlow.error = "";
  mockFlow.step = "prove";
  mockFlow.proofState = "idle";
  mockFlow.createdId = undefined;
  navigateProductRoute("/confess");
}

function renderExploreFeed(root: ParentNode, tab: FeedTab): void {
  const list = root.querySelector<HTMLElement>("#explore-feed-list");
  if (!list) {
    return;
  }

  list.innerHTML = renderTransmissionRows(tab);
  root.querySelectorAll<HTMLButtonElement>("[data-feed-tab]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.feedTab === tab));
  });
  bindComponentInteractions(list);
  bindRoomLikeInteractions(list);
}

function bindRoomLikeInteractions(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('[data-action="room-like"]').forEach((button) => {
    button.addEventListener("click", () => {
      const threadId = button.dataset.threadId;
      if (!threadId) {
        return;
      }

      const liked = roomLikedIds.has(threadId);
      const displayedCount = Number(button.textContent?.match(/\d+/)?.[0] ?? "0");
      const currentCount = reactionCountForThread(threadId, displayedCount);
      const nextCount = currentCount + (liked ? -1 : 1);
      if (liked) {
        roomLikedIds.delete(threadId);
      } else {
        roomLikedIds.add(threadId);
      }
      roomLikeCounts.set(threadId, Math.max(0, nextCount));

      if (normalizePath(window.location.pathname) === "/room" || normalizePath(window.location.pathname) === "/explore") {
        renderExploreFeed(root, activeFeedTab);
      } else {
        rerenderProductRoute();
      }
    });
  });
}

function bindRoomChannelInteractions(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>("[data-room-channel]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.roomChannel as RoomChannel | undefined;
      if (!key || !roomChannelOptions.some((channel) => channel.key === key)) {
        return;
      }

      activeRoomChannel = key;
      roomChannelNotice = "";
      rerenderProductRoute();
    });
  });
}

function bindRoomFolderInteractions(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>("[data-room-folder-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const panelId = button.getAttribute("aria-controls");
      const panel = panelId ? root.querySelector<HTMLElement>(`#${panelId}`) : null;
      if (!panel) {
        return;
      }

      const isOpen = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!isOpen));
      panel.hidden = isOpen;
      button.closest<HTMLElement>(".room-directory__folder")?.classList.toggle("room-directory__folder--open", !isOpen);
      const caret = button.querySelector<HTMLElement>(".room-directory__folder-caret");
      if (caret) {
        caret.textContent = isOpen ? "▸" : "▾";
      }
    });
  });
}

function bindPointerSpotlightInteractions(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-pointer-surface]").forEach((surface) => {
    const updatePointer = (event: PointerEvent): void => {
      const bounds = surface.getBoundingClientRect();
      if (!bounds.width || !bounds.height) {
        return;
      }

      const x = ((event.clientX - bounds.left) / bounds.width) * 100;
      const y = ((event.clientY - bounds.top) / bounds.height) * 100;
      surface.style.setProperty("--pointer-x", `${Math.max(0, Math.min(100, x))}%`);
      surface.style.setProperty("--pointer-y", `${Math.max(0, Math.min(100, y))}%`);
      surface.dataset.pointerActive = "true";
    };

    const resetPointer = (): void => {
      surface.dataset.pointerActive = "false";
    };

    surface.addEventListener("pointerenter", updatePointer, { passive: true });
    surface.addEventListener("pointermove", updatePointer, { passive: true });
    surface.addEventListener("pointerleave", resetPointer, { passive: true });
    surface.addEventListener("pointercancel", resetPointer, { passive: true });
  });
}

export function bindProductRoute(root: ParentNode = document): void {
  bindComponentInteractions(root);
  bindRoomLikeInteractions(root);
  bindRoomChannelInteractions(root);
  bindRoomFolderInteractions(root);
  bindPointerSpotlightInteractions(root);
  void refreshZcashNetworkStatus(root);
  startVisitorClock(root);
  if (normalizePath(window.location.pathname) === "/room/access" && roomAccessMode === "create") {
    void refreshRoomConfig(root);
  }
  root.querySelectorAll<HTMLAnchorElement>('a[href="/"]').forEach((link) => {
    if (link.matches("[data-room-logout]") || link.textContent?.trim() === "LOG OUT") {
      link.addEventListener("click", clearRoomSession);
    }
  });

  if (normalizePath(window.location.pathname) === "/") {
    const audioToggle = root.querySelector<HTMLButtonElement>("#home-audio-toggle");
    if (audioToggle && typeof window.AudioContext === "undefined") {
      setHomeAudioUnavailable(root);
    } else {
      audioToggle?.addEventListener("click", () => {
        toggleHomeAudio(root);
      });
    }
  } else {
    stopHomeStream();
    stopHomeHeadline();
    stopHomeAudio();
  }

  root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      switch (button.dataset.action) {
        case "selection-save":
          void shareSelectedTexts(root, activeTextSelection ? [activeTextSelection] : [], "save");
          break;
        case "selection-share":
          void shareSelectedTexts(root, activeTextSelection ? [activeTextSelection] : [], "share");
          break;
        case "selection-add":
          if (activeTextSelection) {
            const alreadySelected = selectedTextBatch.some(
              (item) => item.id === activeTextSelection?.id && item.text === activeTextSelection.text,
            );
            if (!alreadySelected) {
              selectedTextBatch = [...selectedTextBatch, activeTextSelection];
            }
            updateSelectionBatch(root);
            setSelectionStatus(root, `${selectedTextBatch.length} TEXT SIGNAL${selectedTextBatch.length === 1 ? "" : "S"} READY`);
          }
          break;
        case "selection-batch-share":
          void shareSelectedTexts(root, selectedTextBatch, "share");
          break;
        case "selection-batch-clear":
          selectedTextBatch = [];
          updateSelectionBatch(root);
          setSelectionStatus(root, "TEXT BATCH CLEARED");
          break;
        case "selection-close":
          activeTextSelection = undefined;
          hideSelectionTools(root);
          break;
        case "room-menu-toggle": {
          const menu = button.closest<HTMLElement>("[data-room-menu]");
          const panel = menu?.querySelector<HTMLElement>(".room-menu__panel");
          if (!panel) {
            break;
          }

          const isOpen = !panel.hidden;
          panel.hidden = isOpen;
          button.setAttribute("aria-expanded", String(!isOpen));
          button.setAttribute("aria-label", isOpen ? "Open private room menu" : "Close private room menu");
          menu?.classList.toggle("room-menu--open", !isOpen);
          break;
        }
        case "room-create":
          roomAccessMode = "create";
          roomDemoId = "";
          roomDemoMemo = `HIDN-ROOM-${createRoomDemoId().slice(-6)}`;
          roomLoginError = "";
          roomBackendId = "";
          roomBackendStatus = "connecting";
          sessionStorage.removeItem("hidn:room:secret");
          sessionStorage.removeItem("hidn:room:verified");
          rerenderProductRoute();
          void registerRoomBackend();
          break;
        case "room-login":
          roomAccessMode = "login";
          roomLoginError = "";
          rerenderProductRoute();
          break;
        case "room-back":
          roomAccessMode = "choose";
          roomDemoId = "";
          roomDemoMemo = "";
          roomLoginError = "";
          roomBackendStatus = "local";
          rerenderProductRoute();
          break;
        case "room-verify-demo":
          if (roomBackendStatus !== "connected" || !roomBackendId || !roomDemoId) {
            roomLoginError = "Wait for the Worker to issue your access code before verifying the demo payment.";
            rerenderProductRoute();
            break;
          }

          roomBackendStatus = "connecting";
          roomLoginError = "";
          rerenderProductRoute();
          void verifyRoomBackend();
          break;
        case "room-submit-login": {
          const input = root.querySelector<HTMLInputElement>("#room-login-id");
          const value = input?.value.trim() ?? "";
          if (!value) {
            roomLoginError = "Enter the ID you keep on your side before continuing.";
            rerenderProductRoute();
            break;
          }

          roomDemoId = value;
          roomLoginError = "";
          roomBackendStatus = "connecting";
          rerenderProductRoute();
          void syncRoomLogin(value);
          break;
        }
        case "room-enter":
          sessionStorage.setItem("hidn:room:entered", "true");
          navigateProductRoute("/room");
          break;
        case "room-create-channel":
          roomChannelNotice = "ROOM CREATION REQUEST QUEUED / LOCAL PROTOTYPE";
          rerenderProductRoute();
          break;
        case "thread-reply": {
          const threadRoot = button.closest<HTMLElement>("[data-thread-root]");
          const input = threadRoot?.querySelector<HTMLTextAreaElement>("[data-thread-input]");
          const value = input?.value.trim() ?? "";
          if (!threadRoot || !value) {
            input?.focus();
            break;
          }

          const threadId = threadRoot.dataset.threadRoot;
          if (threadId) {
            repliesForThread(threadId).push({ text: value, time: "JUST NOW" });
            rerenderProductRoute();
          }
          break;
        }
        case "thread-save-image":
          void shareThreadImage(root, button.dataset.threadId ?? "", "save", replyIndexFromButton(button));
          break;
        case "thread-share-image":
          void shareThreadImage(root, button.dataset.threadId ?? "", "share", replyIndexFromButton(button));
          break;
        case "thread-x-share":
          void shareThreadImage(root, button.dataset.threadId ?? "", "x", replyIndexFromButton(button));
          break;
        case "proof-start":
          void runMockProof();
          break;
        case "proof-continue":
          mockFlow.step = "confess";
          mockFlow.error = "";
          rerenderProductRoute();
          break;
        case "confess-continue": {
          const textarea = root.querySelector<HTMLTextAreaElement>("#confession-thought");
          mockFlow.thought = textarea?.value ?? "";
          if (!mockFlow.thought.trim()) {
            mockFlow.error = "Write a thought before continuing. The demo does not publish empty transmissions.";
            rerenderProductRoute();
            break;
          }

          mockFlow.error = "";
          mockFlow.step = "preview";
          rerenderProductRoute();
          break;
        }
        case "confession-edit":
          mockFlow.step = "confess";
          mockFlow.error = "";
          rerenderProductRoute();
          break;
        case "confession-post":
          if (mockFlow.thought.trim()) {
            createMockConfession();
            mockFlow.step = "success";
            rerenderProductRoute();
          }
          break;
        case "leave-hidn":
          resetMockFlow();
          navigateProductRoute("/");
          break;
        default:
          break;
      }
    });
  });

  root.querySelector<HTMLTextAreaElement>("#confession-thought")?.addEventListener("input", (event) => {
    const textarea = event.currentTarget as HTMLTextAreaElement;
    mockFlow.thought = textarea.value;
    mockFlow.error = "";
  });

  root.querySelector<HTMLSelectElement>("#confession-category")?.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    if (isMockCategory(select.value)) {
      mockFlow.category = select.value;
    }
  });

  root.querySelectorAll<HTMLButtonElement>("[data-feed-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.feedTab;
      if (tab === "latest" || tab === "random" || tab === "felt") {
        activeFeedTab = tab;
        renderExploreFeed(root, activeFeedTab);
      }
    });
  });

  bindTextSelectionInteractions(root);
}
