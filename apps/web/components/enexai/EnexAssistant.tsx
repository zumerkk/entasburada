"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleHelp, GitCompareArrows, History, LoaderCircle, LogIn, MessageCircle, Mic, Package, Plus, RotateCcw, Search, Send, ShoppingBag, ShoppingCart, Sparkles, Square, Truck, Volume2, VolumeX, WandSparkles, X } from "lucide-react";
import type { EnexChatMessage, EnexChatResponse, EnexContextResponse, EnexLink, EnexOrder, EnexOrderItem, EnexProduct } from "../../lib/enexai-types";
import { CART_CHANGED_EVENT, type CartChangedDetail } from "../cart-events";
import { EnexMascot } from "./EnexMascot";
import { useEnexVoice } from "./useEnexVoice";
import styles from "./EnexAssistant.module.css";

type Tab = "chat" | "discover" | "orders";
interface Message extends EnexChatMessage { id: number; products?: EnexProduct[]; links?: EnexLink[]; hasOrders?: boolean }
interface CartItem { productSlug: string; sku: string; productName: string; quantity: number; unit: string }

const EMPTY_CONTEXT: EnexContextResponse = { authenticated: false, sessionScope: "anonymous", mode: "catalog", products: [], orders: [], suggestions: [], links: [] };
const QUICK_PROMPTS = ["Aradığım ürünü bul", "Sepetimi tamamla", "Önceki siparişimi tekrarla", "Muadil ürün öner"];
const EXPLORE_PROMPTS = [
  { icon: Search, title: "Doğru ürünü bul", text: "Ne iş için ürün aradığımı sorarak bana uygun ürünleri bul." },
  { icon: GitCompareArrows, title: "Ürünleri karşılaştır", text: "Ürün karşılaştırmak istiyorum. Hangi özellikleri dikkate almalıyım?" },
  { icon: ShoppingBag, title: "Bütçeme göre seç", text: "Bütçeme uygun bir alışveriş listesi hazırlamak istiyorum." },
  { icon: WandSparkles, title: "Projemi hazırla", text: "Yapacağım iş için gerekli malzemeleri birlikte listeleyelim." },
  { icon: Package, title: "Alternatifini bul", text: "Stokta olmayan bir ürün için uygun alternatif bulmak istiyorum." },
  { icon: Truck, title: "Kargo ve teslimat", text: "Kargo, ücretsiz gönderim ve teslimat hakkında bilgi verir misin?" },
  { icon: CircleHelp, title: "İade ve destek", text: "İade, garanti ve teknik destek için beni doğru sayfalara yönlendir." },
  { icon: ShoppingCart, title: "Eksikleri tamamla", text: "Sepetim için tamamlayıcı ürünleri ve eksik olabilecek malzemeleri öner." }
];

function getTip(pathname: string): { title: string; text: string; prompt: string } {
  if (pathname.includes("cart")) return { title: "Sepetinize bir göz atalım mı?", text: "Eksik bir parça kalmasın. Birlikte tamamlayalım.", prompt: "Sepetimi incele, eksik ve tamamlayıcı ürünleri öner." };
  if (pathname.startsWith("/products/")) return { title: "Doğru seçim, birlikte daha kolay.", text: "Bu ürünü inceleyebilir, alternatifini bulabiliriz.", prompt: "Şu an incelediğim ürünü anlat ve uygun alternatiflerini göster." };
  if (pathname.includes("order")) return { title: "Yeniden sipariş, birkaç dokunuş.", text: "Önceki alışverişinizden ürünleri birlikte seçelim.", prompt: "Önceki siparişlerimi tekrar etmek istiyorum." };
  if (pathname.includes("search") || pathname.includes("catalog")) return { title: "Ne aradığınızı bana anlatın.", text: "Ürün adı, marka ya da yapacağınız iş yeterli.", prompt: "Aradığım ürünü birlikte bulalım." };
  return { title: "Merhaba, ben EnexAI!", text: "ENTAŞ'ta aradığınız her şey için yanınızdayım.", prompt: "Alışverişimde bana nasıl yardımcı olabilirsin?" };
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function requestMessages(messages: Message[]): EnexChatMessage[] {
  const result: EnexChatMessage[] = [];
  let characters = 0;
  for (const message of messages.slice(-14).reverse()) {
    const content = message.content.slice(0, 1600);
    if (characters + content.length > 12000) break;
    result.unshift({ role: message.role, content });
    characters += content.length;
  }
  return result;
}

function orderRowKey(item: EnexOrderItem, index: number) { return `${index}:${item.productSlug}:${item.sku}`; }

export function EnexAssistant() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [context, setContext] = useState<EnexContextResponse>(EMPTY_CONTEXT);
  const [contextLoading, setContextLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tipVisible, setTipVisible] = useState(false);
  const [cartTip, setCartTip] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [compare, setCompare] = useState<EnexProduct[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [orderSelection, setOrderSelection] = useState<Record<string, number>>({});
  const [celebrating, setCelebrating] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const chatRequest = useRef<AbortController | null>(null);
  const contextRequest = useRef<AbortController | null>(null);
  const cartRequest = useRef<AbortController | null>(null);
  const celebrationTimer = useRef<number | null>(null);
  const messageSequence = useRef(0);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const messagesRef = useRef<Message[]>([]);
  const selfCartUpdate = useRef(false);
  const voice = useEnexVoice(setInput);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const currentPath = useRef(pathname);
  currentPath.current = pathname;
  const sessionScope = useRef<string | null>(null);
  const tip = cartTip ? { title: "Bu siparişte başka ne gerekli?", text: "Önceki siparişinizden ürün ekleyebiliriz.", prompt: "Sepetime ekleme yaptım. Önceki siparişlerimden tekrar alabileceğim ürünleri göster." } : getTip(pathname);

  const loadContext = useCallback(async (showLoading = true) => {
    contextRequest.current?.abort();
    const controller = new AbortController();
    contextRequest.current = controller;
    if (showLoading) setContextLoading(true);
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`/api/enexai/context?pathname=${encodeURIComponent(currentPath.current)}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Asistan bilgileri yüklenemedi.");
      const result = await response.json() as EnexContextResponse;
      if (!controller.signal.aborted && mounted.current) {
        const nextScope = result.sessionScope || (result.authenticated ? "authenticated" : "anonymous");
        if (sessionScope.current !== null && sessionScope.current !== nextScope) {
          chatRequest.current?.abort();
          chatRequest.current = null;
          cartRequest.current?.abort();
          cartRequest.current = null;
          setAdding(null);
          busyRef.current = false;
          setBusy(false);
          messagesRef.current = [];
          setMessages([]);
          setInput("");
          setCompare([]);
          setSelectedOrder(null);
          setOrderSelection({});
          setNotice("");
          voiceRef.current.stopSpeech();
          voiceRef.current.stopListening();
        }
        sessionScope.current = nextScope;
        setContext(result);
      }
    } catch {
      if (contextRequest.current === controller && mounted.current) setError("Bağlantı kurulamadı. Mesaj göndererek yeniden deneyebilirsiniz.");
    } finally {
      window.clearTimeout(timer);
      if (contextRequest.current === controller && mounted.current) setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      chatRequest.current?.abort();
      contextRequest.current?.abort();
      cartRequest.current?.abort();
      if (celebrationTimer.current !== null) window.clearTimeout(celebrationTimer.current);
    };
  }, []);

  useEffect(() => {
    // Personal results must not survive an account or route transition.
    chatRequest.current?.abort();
    chatRequest.current = null;
    cartRequest.current?.abort();
    cartRequest.current = null;
    setAdding(null);
    busyRef.current = false;
    setBusy(false);
    setError("");
    voiceRef.current.stopSpeech();
    voiceRef.current.stopListening();
    setContext(EMPTY_CONTEXT);
    setCompare([]);
    setSelectedOrder(null);
    setOrderSelection({});
    messagesRef.current = [];
    setMessages([]);
    setInput("");
    void loadContext();
  }, [pathname, loadContext]);

  useEffect(() => {
    if (tipDismissed || open) return;
    const timer = window.setTimeout(() => setTipVisible(true), 6500);
    return () => window.clearTimeout(timer);
  }, [tipDismissed, open]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const cartChanged = () => {
      void loadContext(false);
      if (!selfCartUpdate.current && !tipDismissed) {
        setCartTip(true);
        setTipVisible(true);
      }
      selfCartUpdate.current = false;
    };
    const syncAccount = () => {
      if (document.visibilityState === "visible") void loadContext(false);
    };
    window.addEventListener(CART_CHANGED_EVENT, cartChanged);
    window.addEventListener("focus", syncAccount);
    return () => {
      window.removeEventListener(CART_CHANGED_EVENT, cartChanged);
      window.removeEventListener("focus", syncAccount);
    };
  }, [loadContext, tipDismissed]);

  const close = useCallback(() => {
    setOpen(false);
    chatRequest.current?.abort();
    chatRequest.current = null;
    if (busyRef.current) {
      const pending = messagesRef.current.at(-1);
      if (pending?.role === "user") {
        setInput(pending.content);
        messagesRef.current = messagesRef.current.slice(0, -1);
        setMessages(messagesRef.current);
      }
    }
    busyRef.current = false;
    setBusy(false);
    voiceRef.current.stopSpeech();
    voiceRef.current.stopListening();
    launcher.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => { if (tab === "chat") composer.current?.focus({ preventScroll: true }); }, 120);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
    };
    window.addEventListener("keydown", escape);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", escape); };
  }, [open, tab, close]);

  useEffect(() => {
    if (conversation.current && tab === "chat") {
      conversation.current.scrollTo({ top: conversation.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  }, [messages, busy, tab]);

  const send = useCallback(async (value: string) => {
    const text = value.trim().slice(0, 1600);
    if (!text || busyRef.current) return;
    busyRef.current = true;
    voiceRef.current.stopListening();
    voiceRef.current.stopSpeech();
    setInput("");
    setError("");
    setOpen(true);
    setTab("chat");
    setTipVisible(false);
    setTipDismissed(true);
    const nextMessages: Message[] = [...messagesRef.current, { id: ++messageSequence.current, role: "user", content: text }];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setBusy(true);
    const controller = new AbortController();
    chatRequest.current?.abort();
    chatRequest.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 50_000);
    try {
      const response = await fetch("/api/enexai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ messages: requestMessages(nextMessages), context: { pathname: currentPath.current } })
      });
      const data = await response.json() as EnexChatResponse & { error?: string };
      if (!response.ok || !data.reply) throw new Error(data.error || "Mesaj gönderilemedi. Lütfen yeniden deneyin.");
      if (controller.signal.aborted || chatRequest.current !== controller || !mounted.current) return;
      const reply: Message = { id: ++messageSequence.current, role: "assistant", content: data.reply, products: data.products, links: data.links.filter((link) => /^\/(?!\/)/.test(link.href)), hasOrders: data.orders.length > 0 };
      messagesRef.current = [...nextMessages, reply];
      setMessages(messagesRef.current);
      setContext((previous) => ({ ...previous, mode: data.mode, products: data.products, orders: data.orders.length ? data.orders : previous.orders, suggestions: data.suggestions, links: data.links }));
      if (voiceRef.current.enabled) void voiceRef.current.speak(data.reply);
    } catch (cause) {
      if (chatRequest.current !== controller || !mounted.current) return;
      setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Yanıt biraz uzun sürdü. Mesajınızı yeniden gönderebilirsiniz.");
      setInput(text);
      messagesRef.current = nextMessages.slice(0, -1);
      setMessages(messagesRef.current);
    } finally {
      window.clearTimeout(timer);
      if (chatRequest.current === controller && mounted.current) { setBusy(false); busyRef.current = false; }
    }
  }, []);

  useEffect(() => {
    const openFromPage = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string; tab?: Tab }>).detail;
      setOpen(true);
      setTipVisible(false);
      setTipDismissed(true);
      if (detail?.tab && ["chat", "discover", "orders"].includes(detail.tab)) setTab(detail.tab);
      if (detail?.prompt) void send(detail.prompt);
    };
    window.addEventListener("entas-enexai-open", openFromPage);
    return () => window.removeEventListener("entas-enexai-open", openFromPage);
  }, [send]);

  function openAssistant(nextTab: Tab = "chat") {
    setOpen(true);
    setTab(nextTab);
    setTipVisible(false);
    setTipDismissed(true);
    setError("");
  }

  function login() { window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); }

  async function addItems(items: CartItem[], key: string) {
    if (!context.authenticated) { login(); return; }
    if (adding || !items.length) return;
    setAdding(key);
    setError("");
    const controller = new AbortController();
    cartRequest.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch("/api/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }), signal: controller.signal });
      const data = await response.json() as { error?: string; cart?: { items: Array<{ quantity: number }> } };
      if (response.status === 401) { login(); return; }
      if (!response.ok || !data.cart) throw new Error(data.error || "Ürünler sepete eklenemedi.");
      if (!mounted.current || controller.signal.aborted || cartRequest.current !== controller) return;
      selfCartUpdate.current = true;
      window.dispatchEvent(new CustomEvent<CartChangedDetail>(CART_CHANGED_EVENT, { detail: { lineCount: data.cart.items.length, totalQuantity: data.cart.items.reduce((total, item) => total + item.quantity, 0) } }));
      const firstItem = items[0];
      setNotice(`${items.length === 1 && firstItem ? firstItem.quantity + " " + firstItem.unit : items.length + " ürün"} sepetinize eklendi.`);
      setCelebrating(true);
      if (celebrationTimer.current !== null) window.clearTimeout(celebrationTimer.current);
      celebrationTimer.current = window.setTimeout(() => setCelebrating(false), 2200);
      if (key === "order") setOrderSelection({});
    } catch (cause) {
      if (mounted.current && cartRequest.current === controller) setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Sepet yanıtı alınamadı. Yeniden eklemeden önce sepetinizi kontrol edin.");
    } finally {
      window.clearTimeout(timer);
      if (mounted.current && cartRequest.current === controller) setAdding(null);
    }
  }

  function compareProduct(product: EnexProduct) {
    setCompare((previous) => previous.some((item) => item.slug === product.slug) ? previous.filter((item) => item.slug !== product.slug) : previous.length < 3 ? [...previous, product] : previous);
  }

  function clearConversation() {
    chatRequest.current?.abort();
    chatRequest.current = null;
    busyRef.current = false;
    setBusy(false);
    messagesRef.current = [];
    setMessages([]);
    setInput("");
    setError("");
    setCompare([]);
    voice.stopSpeech();
    voice.stopListening();
    void loadContext();
    composer.current?.focus({ preventScroll: true });
  }

  const activeOrder = context.orders.find((order) => order.id === selectedOrder);
  const orderItems = activeOrder?.items.flatMap((item, index) => {
    const quantity = orderSelection[orderRowKey(item, index)] ?? 0;
    return quantity > 0 ? [{ productSlug: item.productSlug, sku: item.sku, productName: item.productName, unit: item.unit, quantity: Math.max(item.minOrder ?? 1, quantity) }] : [];
  }) ?? [];
  const mascotState = voice.listening ? "listening" : voice.speaking ? "speaking" : busy || voice.loading ? "thinking" : celebrating ? "celebrating" : "idle";
  const suggestions = context.suggestions.length ? context.suggestions : QUICK_PROMPTS;
  const submit = (event: FormEvent) => { event.preventDefault(); void send(input); };
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");

  function renderProduct(product: EnexProduct) {
    return <ProductCard key={product.slug} product={product} authenticated={context.authenticated} selected={compare.some((item) => item.slug === product.slug)} compareDisabled={compare.length >= 3 && !compare.some((item) => item.slug === product.slug)} adding={adding === product.slug} anyAdding={adding !== null} onCompare={() => compareProduct(product)} onAdd={(quantity) => void addItems([{ productSlug: product.slug, sku: product.sku, productName: product.name, quantity, unit: product.unit }], product.slug)} onAlternative={() => void send(`${product.name} (${product.sku}) için stokta olan uygun alternatifleri bul.`)} />;
  }

  return (
    <div className={styles.root} data-enexai="assistant">
      {!open && tipVisible && !tipDismissed && <div className={styles.tip}>
        <button className={styles.tipClose} type="button" aria-label="EnexAI önerisini kapat" onClick={() => { setTipVisible(false); setTipDismissed(true); }}><X size={14} /></button>
        <button className={styles.tipContent} type="button" onClick={() => void send(tip.prompt)}><span className={styles.eyebrow}><Sparkles size={11} /> SİZE BİR FİKRİM VAR</span><strong>{tip.title}</strong><span>{tip.text}</span><span className={styles.tipCta}>Birlikte bakalım <ArrowRight size={13} /></span></button>
      </div>}

      {open && <section className={styles.panel} role="dialog" aria-modal="false" aria-label="EnexAI alışveriş asistanı" id="enexai-panel">
        <header className={styles.header}>
          <div className={styles.headerIdentity}><span className={styles.brandMark}><Sparkles size={21} /></span><span><strong>Enex<span>AI</span><span className={styles.onlineDot} /></strong><small>ENTAŞ'ın akıllı yol arkadaşı</small></span></div>
          <div className={styles.headerActions}>
            <button type="button" aria-label={voice.enabled ? "Sesli yanıtları kapat" : "Yapay zekâ sesli yanıtlarını aç"} aria-pressed={voice.enabled} title={voice.enabled ? "Sesli yanıtlar açık" : "Sesli yanıtları aç"} onClick={() => { if (context.mode !== "openai") { setNotice("Sesli yanıtlar OpenAI bağlantısı etkinleştiğinde kullanılabilir."); return; } voice.toggleEnabled(); if (!voice.enabled) { if (latestAssistant) void voice.speak(latestAssistant.content); else setNotice("Sesli yanıtlar açıldı. Duyacağınız ses yapay zekâ tarafından üretilir."); } }} className={voice.enabled ? styles.activeHeaderButton : undefined}>{voice.enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
            <button type="button" aria-label="Yeni sohbet başlat" title="Yeni sohbet" onClick={clearConversation}><RotateCcw size={16} /></button>
            <button type="button" aria-label="EnexAI penceresini kapat" title="Kapat" onClick={close}><X size={20} /></button>
          </div>
        </header>

        <div className={styles.tabs} role="tablist" aria-label="Asistan bölümleri">
          {([{ id: "chat", label: "Sohbet", Icon: MessageCircle }, { id: "discover", label: "Keşfet", Icon: Sparkles }, { id: "orders", label: "Siparişlerim", Icon: History }] as const).map(({ id, label, Icon }, index, all) => <button key={id} type="button" role="tab" id={`enexai-tab-${id}`} aria-selected={tab === id} aria-controls={`enexai-view-${id}`} tabIndex={tab === id ? 0 : -1} className={tab === id ? styles.activeTab : ""} onClick={() => setTab(id)} onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); const next = all[(index + (event.key === "ArrowRight" ? 1 : -1) + all.length) % all.length]!.id; setTab(next); document.getElementById(`enexai-tab-${next}`)?.focus(); } }}><Icon size={15} />{label}</button>)}
        </div>

        <div className={styles.modeBar}><span className={context.mode === "openai" ? styles.modeLive : styles.modeCatalog}><span />{contextLoading ? "Bağlanıyor" : context.mode === "openai" ? "OpenAI ile güçlendirildi" : "Katalog asistanı"}</span><a href="/enexai">Neler yapabilirim? <ArrowUpRight size={12} /></a></div>

        {compare.length > 0 && <div className={styles.compareBar}><span><GitCompareArrows size={15} /> {compare.length}/3 ürün seçili</span><button type="button" disabled={compare.length < 2 || busy} onClick={() => { void send(`Şu ürünleri mevcut katalog özellikleri, kullanım alanı ve fiyat bilgisi varsa fiyatlarıyla karşılaştır: ${compare.map((product) => product.name + " (" + product.sku + ")").join(", ")}. Eksik teknik bilgileri belirt.`); setCompare([]); }}>Karşılaştır <ArrowRight size={13} /></button><button type="button" aria-label="Karşılaştırma seçimini temizle" onClick={() => setCompare([])}><X size={14} /></button></div>}

        <div className={styles.content} ref={conversation} role="tabpanel" id={`enexai-view-${tab}`} aria-labelledby={`enexai-tab-${tab}`} tabIndex={0}>
          {tab === "chat" && <>
            {messages.length === 0 && <>
              <div className={styles.welcome}>
                <div className={styles.welcomeCopy}><span className={styles.eyebrow}>BİRLİKTE, DAHA KOLAY.</span><h2>{context.customerName ? `Merhaba, ${context.customerName.split(" ")[0]}.` : "Merhaba, ben EnexAI."}<br /><span>Ne lazım, birlikte bulalım.</span></h2><p>Doğru üründen tekrar siparişe,<br />alışverişinizin her adımında buradayım.</p></div>
                <div className={styles.welcomeMascot}><EnexMascot state={mascotState} size={145} {...(voice.hasAudioMeter ? { audioLevel: voice.audioLevel } : {})} /></div>
                <span className={styles.welcomeSparkle}>✦</span>
              </div>
              <div className={styles.quickStart}><span className={styles.sectionCaption}>NEREDEN BAŞLAYALIM?</span><div className={styles.quickGrid}>{QUICK_PROMPTS.map((prompt, index) => <button key={prompt} type="button" onClick={() => index === 2 ? setTab("orders") : void send(prompt)}><span>{index === 0 ? <Search size={17} /> : index === 1 ? <ShoppingCart size={17} /> : index === 2 ? <History size={17} /> : <GitCompareArrows size={17} />}</span>{prompt}<ArrowUpRight size={12} /></button>)}</div></div>
              <div className={styles.introNote}><span className={styles.smallBrand}><Sparkles size={13} /></span><p>Bana bir ürün adı ya da yapacağınız işi yazın. Örneğin <button type="button" onClick={() => void send("Banyo tesisatını yenilemek için hangi malzemeler gerekir?")}>“Banyo tesisatını yeniliyorum.”</button></p></div>
              {!contextLoading && context.mode === "catalog" && <p className={styles.fallbackNote}>Şu anda katalog araması ve sipariş araçlarıyla yardımcı oluyorum. Serbest sohbet ve sesli yanıtlar OpenAI bağlantısı etkinleştiğinde kullanılabilir.</p>}
            </>}
            <div className={styles.messages} role="log" aria-label="EnexAI sohbeti" aria-live="polite" aria-relevant="additions text">
              {messages.map((message) => <div key={message.id} className={message.role === "user" ? styles.userMessage : styles.assistantMessage}>
                {message.role === "assistant" && <div className={styles.messageByline}><span><Sparkles size={11} /></span>EnexAI</div>}
                <div className={styles.messageText}>{message.content.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</div>
                {message.role === "assistant" && <button type="button" className={styles.readMessage} title="Yapay zekâ sesiyle dinle" onClick={() => void voice.speak(message.content)} disabled={voice.loading || context.mode !== "openai"}><Volume2 size={12} /> Dinle</button>}
                {Boolean(message.products?.length) && <div className={styles.productGrid}>{message.products!.slice(0, 4).map(renderProduct)}</div>}
                {(message.links?.length || message.hasOrders) ? <div className={styles.messageLinks}>
                  {message.hasOrders && <button type="button" onClick={() => setTab("orders")}><History size={13} /> Siparişlerden ürün seç <ArrowRight size={13} /></button>}
                  {message.links?.map((link) => <a key={link.href} href={link.href}>{link.label}<ArrowUpRight size={12} /></a>)}
                </div> : null}
              </div>)}
              {busy && <div className={styles.thinking} role="status"><EnexMascot state="thinking" size={45} /><span><strong>Sizin için bakıyorum</strong><small>Ürünleri ve seçenekleri inceliyorum</small></span><span className={styles.typingDots}><i /><i /><i /></span></div>}
            </div>
            {messages.length > 0 && !busy && <div className={styles.followups}>{suggestions.slice(0, 4).map((suggestion) => <button type="button" key={suggestion} onClick={() => void send(suggestion)}>{suggestion}<ArrowUpRight size={12} /></button>)}</div>}
          </>}

          {tab === "discover" && <div className={styles.explore}>
            <div className={styles.sectionHeading}><span className={styles.eyebrow}>BİR FİKİRDEN DAHA FAZLASI</span><h2>Birlikte neler yapabiliriz?</h2><p>İhtiyacınızı seçin, gerisini birlikte bulalım.</p></div>
            <div className={styles.exploreGrid}>{EXPLORE_PROMPTS.map(({ icon: Icon, title, text }) => <button key={title} type="button" onClick={() => void send(text)}><Icon size={19} /><span>{title}</span><ArrowUpRight size={13} /></button>)}</div>
            {context.cart && context.cart.itemCount > 0 && <div className={styles.cartSummary}><span className={styles.cartSummaryIcon}><ShoppingCart size={22} /></span><div><strong>Sepetinizde {context.cart.itemCount} ürün</strong><span>{context.cart.total}</span><small>{context.cart.freeShipping ? "Ücretsiz kargo avantajı sizinle." : `Ücretsiz kargoya ${context.cart.freeShippingRemaining} kaldı.`}</small></div><a href="/cart" aria-label="Sepetime git"><ArrowUpRight size={17} /></a></div>}
            <div className={styles.productHeading}><h3>{messages.length ? "Konuştuğumuz ürünler" : "Katalogdan sizin için"}</h3><a href="/catalog">Tüm ürünler <ArrowUpRight size={12} /></a></div>
            {contextLoading ? <div className={styles.loadingState}><LoaderCircle size={20} className={styles.spin} /> Ürünler yükleniyor…</div> : context.products.length ? <><p className={styles.compareHint}><GitCompareArrows size={13} /> Karşılaştırmak için 2 veya 3 ürün seçebilirsiniz.</p><div className={styles.productGrid}>{context.products.slice(0, 8).map(renderProduct)}</div></> : <div className={styles.emptyState}><Search size={25} /><strong>Bir ürünle başlayalım.</strong><p>İstediğiniz ürün adını ya da markasını yazın; uygun seçenekleri burada gösterelim.</p><button type="button" className={styles.primaryButton} onClick={() => { setTab("chat"); setInput("Aradığım ürün: "); }}>Ürün ara <Search size={15} /></button></div>}
            {context.links.length > 0 && <div className={styles.usefulLinks}><span className={styles.sectionCaption}>İŞİNİZİ KOLAYLAŞTIRAN KISAYOLLAR</span>{context.links.slice(0, 6).map((link) => <a href={link.href} key={link.href}>{link.label}<ArrowUpRight size={14} /></a>)}</div>}
          </div>}

          {tab === "orders" && <div className={styles.orders}>
            <div className={styles.sectionHeading}><span className={styles.eyebrow}>TANIDIĞINIZ ÜRÜNLER, YENİDEN</span><h2>Bir daha lazım olur.</h2><p>Önceki siparişinizden seçin, miktarı belirleyin ve sepetinize ekleyin.</p></div>
            {contextLoading ? <div className={styles.loadingState}><LoaderCircle size={20} className={styles.spin} /> Siparişler yükleniyor…</div> : !context.authenticated ? <div className={styles.loginCard}><span><History size={27} /></span><h3>Siparişlerinizi hatırlayalım.</h3><p>Bayi hesabınıza giriş yaparak önceki siparişlerinizden hızlıca ürün seçebilirsiniz.</p><button type="button" className={styles.primaryButton} onClick={login}>Bayi girişi yap <LogIn size={16} /></button><small>Yalnızca kendi hesabınızın siparişleri gösterilir.</small></div> : context.orders.length === 0 ? <div className={styles.emptyState}><Package size={28} /><strong>İlk siparişinizle başlayalım.</strong><p>Önceki sipariş bulunamadı. Size uygun ürünleri birlikte keşfedebiliriz.</p><button type="button" className={styles.primaryButton} onClick={() => setTab("discover")}>Ürünleri keşfet <ArrowRight size={15} /></button></div> : <>
              <div className={styles.orderList}>{context.orders.map((order) => <OrderCard key={order.id} order={order} active={selectedOrder === order.id} selection={selectedOrder === order.id ? orderSelection : {}} disabled={adding !== null} onOpen={() => { setSelectedOrder(selectedOrder === order.id ? null : order.id); setOrderSelection({}); }} onChange={(key, quantity) => setOrderSelection((previous) => ({ ...previous, [key]: quantity }))} onSelectAll={() => setOrderSelection(Object.fromEntries(order.items.slice(0, 50).flatMap((item, index) => item.available !== false ? [[orderRowKey(item, index), Math.max(item.minOrder ?? 1, item.quantity)]] : [])))} />)}</div>
              <a className={styles.allOrders} href="/orders">Tüm siparişlerimi görüntüle <ArrowUpRight size={14} /></a>
            </>}
          </div>}
        </div>

        {tab === "orders" && orderItems.length > 0 && <div className={styles.orderAction}><div><strong>{orderItems.length} ürün seçildi</strong><small>{orderItems.reduce((total, item) => total + item.quantity, 0)} birim · Güncel fiyat ve stok geçerlidir.</small></div><button type="button" className={styles.primaryButton} disabled={adding !== null || orderItems.length > 50} onClick={() => void addItems(orderItems, "order")}>{adding === "order" ? <LoaderCircle size={16} className={styles.spin} /> : <ShoppingCart size={16} />} Sepete ekle</button></div>}

        {(error || voice.error) && <div className={styles.feedbackError} role="alert"><CircleHelp size={15} /><span>{error || voice.error}</span><button type="button" aria-label="Uyarıyı kapat" onClick={() => { setError(""); voice.clearError(); }}><X size={14} /></button></div>}
        {notice && <div className={styles.feedbackSuccess} role="status"><Check size={16} /><span>{notice}</span>{notice.includes("sepetinize") && <a href="/cart">Sepeti aç <ArrowUpRight size={13} /></a>}</div>}
        {(voice.speaking || voice.loading || voice.listening) && <div className={styles.voiceStatus} role="status"><EnexMascot state={mascotState} size={38} {...(voice.hasAudioMeter ? { audioLevel: voice.audioLevel } : {})} /><span>{voice.listening ? "Dinliyorum… Bitirdiğinizde mesajı gönderebilirsiniz." : voice.loading ? "Yapay zekâ sesi hazırlanıyor…" : "EnexAI konuşuyor · Yapay zekâ tarafından üretilen ses"}</span><button type="button" aria-label={voice.listening ? "Dinlemeyi durdur" : "Sesi durdur"} onClick={() => { voice.stopSpeech(); voice.stopListening(); }}><Square size={12} fill="currentColor" /></button></div>}

        {tab === "chat" && <footer className={styles.composerArea}>
          <form className={`${styles.composer} ${voice.listening ? styles.composerListening : ""}`} onSubmit={submit}>
            <textarea ref={composer} value={input} rows={1} maxLength={1600} aria-label="EnexAI'a mesajınız" placeholder={voice.listening ? "Sizi dinliyorum…" : "Ne arıyorsunuz, birlikte bulalım…"} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(input); } }} />
            <div className={styles.composerActions}>{voice.supported && <button type="button" className={voice.listening ? styles.micActive : styles.micButton} aria-label={voice.listening ? "Sesle yazmayı durdur" : "Mikrofonla Türkçe mesaj yaz (tarayıcı ses tanıma hizmeti)"} aria-pressed={voice.listening} disabled={busy} title="Sesiniz tarayıcınızın ses tanıma hizmetiyle yazıya çevrilir" onClick={voice.startListening}><Mic size={18} /></button>}<button className={styles.sendButton} type="submit" aria-label="Mesajı gönder" disabled={!input.trim() || busy}>{busy ? <LoaderCircle size={18} className={styles.spin} /> : <Send size={17} />}</button></div>
          </form>
          <div className={styles.composerFootnote}><span><Sparkles size={10} /> {voice.enabled ? "Ses açık · Yapay zekâ tarafından üretilir" : "EnexAI yanılabilir. Ürün detaylarını kontrol edin."}</span><span>{input.length > 1300 ? `${input.length}/1600` : "ENTAŞ güvencesiyle"}</span></div>
        </footer>}
      </section>}

      <button ref={launcher} type="button" className={`${styles.launcher} ${open ? styles.launcherOpen : ""}`} aria-label={open ? "EnexAI asistanını kapat" : "EnexAI alışveriş asistanını aç"} aria-expanded={open} aria-controls="enexai-panel" onClick={() => open ? close() : openAssistant()}>
        {open ? <ChevronDown size={26} /> : <><span className={styles.launcherGlow} /><span className={styles.launcherMascot}><EnexMascot state={mascotState} size={104} {...(voice.hasAudioMeter ? { audioLevel: voice.audioLevel } : {})} /></span><span className={styles.launcherLabel}><Sparkles size={11} /> Enex<span>AI</span><span className={styles.launcherStatus} /></span></>}
      </button>
    </div>
  );
}

function ProductCard({ product, authenticated, selected, compareDisabled, adding, anyAdding, onCompare, onAdd, onAlternative }: { product: EnexProduct; authenticated: boolean; selected: boolean; compareDisabled: boolean; adding: boolean; anyAdding: boolean; onCompare: () => void; onAdd: (quantity: number) => void; onAlternative: () => void }) {
  const minimum = Math.max(1, product.minOrder || 1);
  const [quantity, setQuantity] = useState(minimum);
  const [imageFailed, setImageFailed] = useState(false);
  return <article className={`${styles.productCard} ${selected ? styles.productSelected : ""}`}>
    <div className={styles.productVisual}><a href={`/products/${encodeURIComponent(product.slug)}`} tabIndex={-1} aria-hidden="true">{product.image && !imageFailed ? <img src={product.image} alt="" loading="lazy" onError={() => setImageFailed(true)} /> : <Package size={36} strokeWidth={1.1} />}</a><button type="button" className={styles.compareToggle} aria-label={`${product.name} karşılaştırma ${selected ? "seçimini kaldır" : "listesine ekle"}`} aria-pressed={selected} disabled={compareDisabled} title="Karşılaştırmak için seç" onClick={onCompare}>{selected ? <Check size={13} /> : <GitCompareArrows size={13} />}</button></div>
    <div className={styles.productInfo}><span className={styles.productBrand}>{product.brand || "ENTAŞ SEÇKİSİ"}</span><a className={styles.productName} href={`/products/${encodeURIComponent(product.slug)}`}>{product.name}</a><span className={`${styles.stock} ${product.available ? styles.inStock : styles.outStock}`}><i />{product.stockLabel}</span><strong className={styles.productPrice}>{product.price || (authenticated ? "Fiyat için ürünü inceleyin" : "Fiyat için bayi girişi")}<small> / {product.unit}</small></strong>
      {product.available ? <div className={styles.productActions}><input type="number" min={minimum} max={999999} step={1} aria-label={`${product.name} miktarı (${product.unit})`} title={`Minimum ${minimum} ${product.unit}`} value={quantity} disabled={anyAdding} onChange={(event) => setQuantity(Math.min(999999, Math.max(minimum, Math.trunc(Number(event.target.value)) || minimum)))} /><button type="button" disabled={anyAdding} onClick={() => onAdd(quantity)}>{adding ? <LoaderCircle size={14} className={styles.spin} /> : <Plus size={14} />}{adding ? "Ekleniyor" : "Sepete ekle"}</button></div> : <button className={styles.alternativeButton} type="button" onClick={onAlternative}>Alternatifini bul <ArrowRight size={13} /></button>}
    </div>
  </article>;
}

function OrderCard({ order, active, selection, disabled, onOpen, onChange, onSelectAll }: { order: EnexOrder; active: boolean; selection: Record<string, number>; disabled: boolean; onOpen: () => void; onChange: (key: string, quantity: number) => void; onSelectAll: () => void }) {
  return <article className={`${styles.orderCard} ${active ? styles.orderCardActive : ""}`}><button type="button" className={styles.orderHeader} aria-expanded={active} onClick={onOpen}><span className={styles.orderIcon}><Package size={19} /></span><span><strong>#{order.number}</strong><small>{formatDate(order.date)} · {order.items.length} ürün</small></span><span className={styles.orderStatus}>{order.status}</span>{active ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>{active && <div className={styles.orderDetails}><div className={styles.orderSelectHeading}><span>Tekrar almak istediklerinizi seçin</span><button type="button" disabled={disabled} onClick={onSelectAll}>Tümünü seç</button></div>{order.items.slice(0, 50).map((item, index) => <OrderLine key={orderRowKey(item, index)} item={item} quantity={selection[orderRowKey(item, index)] || 0} disabled={disabled} onChange={(quantity) => onChange(orderRowKey(item, index), quantity)} />)}{order.items.length > 50 && <p className={styles.orderLimit}>İlk 50 ürün gösteriliyor. Diğer ürünler için sipariş detayını açabilirsiniz.</p>}</div>}</article>;
}

function OrderLine({ item, quantity, disabled, onChange }: { item: EnexOrderItem; quantity: number; disabled: boolean; onChange: (quantity: number) => void }) {
  const minimum = Math.max(1, item.minOrder ?? 1);
  return <div className={`${styles.orderLine} ${item.available === false ? styles.orderUnavailable : ""}`}><label><input type="checkbox" checked={quantity > 0} disabled={disabled || item.available === false} onChange={(event) => onChange(event.target.checked ? Math.max(minimum, item.quantity) : 0)} /><span><strong>{item.productName}</strong><small>{item.available === false ? "Şu anda sepete eklenemiyor" : `Önceki sipariş: ${item.quantity} ${item.unit}${minimum > 1 ? ` · En az ${minimum}` : ""}`}</small></span></label>{quantity > 0 && <div className={styles.orderQuantity}><input type="number" min={minimum} max={999999} step={1} value={quantity} disabled={disabled} aria-label={`${item.productName} tekrar sipariş miktarı`} onChange={(event) => onChange(Math.min(999999, Math.max(minimum, Math.trunc(Number(event.target.value)) || minimum)))} /><span>{item.unit}</span></div>}</div>;
}
