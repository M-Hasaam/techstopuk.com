// Canonical default "Quick Check" questions — migrated from the wizard's previous
// hardcoded CONDITION_QUESTIONS object so the admin-managed table starts out
// identical to what customers already saw. Icon/tone values reproduce exactly what
// the old text-guessing renderOptionBadge() would have picked for each option.
export interface TradeInQuestionOptionSeed {
    label: string;
    image?: string;
    icon?: string;
    tone?: string;
}

export interface TradeInQuestionSeed {
    category: string;
    key: string;
    question: string;
    order: number;
    options: TradeInQuestionOptionSeed[];
}

export const DEFAULT_TRADE_IN_QUESTIONS: TradeInQuestionSeed[] = [
    // ── Phone ──────────────────────────────────────────────────────────────
    {
        category: "Phone", key: "screen", question: "How is the screen?", order: 0,
        options: [
            { label: "No cracks or scratches", image: "device-images/diagnostics-v3/screen_flawless.webp" },
            { label: "Light surface scratches", image: "device-images/diagnostics-v3/screen_scratches.webp" },
            { label: "Cracked but display works", image: "device-images/diagnostics-v3/screen_cracked.webp" },
            { label: "Shattered / unusable display", image: "device-images/diagnostics-v3/screen_shattered.webp" },
        ],
    },
    {
        category: "Phone", key: "back", question: "How is the back of the phone?", order: 1,
        options: [
            { label: "Perfect — no marks", image: "device-images/diagnostics-v3/back_flawless.webp" },
            { label: "Minor scuffs", image: "device-images/diagnostics-v3/back_minor.webp" },
            { label: "Cracked back glass", image: "device-images/diagnostics-v3/back_cracked.webp" },
        ],
    },
    {
        category: "Phone", key: "battery", question: "What's the battery health?", order: 2,
        options: [
            { label: "90%+: (Excellent)", icon: "battery-charging", tone: "success" },
            { label: "80–89% (Good)", icon: "battery-medium", tone: "info" },
            { label: "70–79% (Fair)", icon: "battery-warning", tone: "warning" },
            { label: "Below 70% / Unknown", icon: "battery-low", tone: "danger" },
        ],
    },
    {
        category: "Phone", key: "biometrics", question: "Is Face ID / Touch ID working?", order: 3,
        options: [
            { label: "Yes, fully working", icon: "scan-face", tone: "success" },
            { label: "No / Faulty", icon: "scan-face", tone: "danger" },
        ],
    },
    {
        category: "Phone", key: "charging", question: "Is the charging port working?", order: 4,
        options: [
            { label: "Yes", icon: "zap", tone: "success" },
            { label: "No / Loose", icon: "zap-off", tone: "danger" },
        ],
    },
    {
        category: "Phone", key: "reset", question: "Is the phone factory reset?", order: 5,
        options: [
            { label: "Yes, already reset", icon: "rotate-ccw", tone: "success" },
            { label: "I'll reset before sending", icon: "clock", tone: "info" },
        ],
    },

    // ── Tablet ─────────────────────────────────────────────────────────────
    {
        category: "Tablet", key: "screen", question: "How is the screen?", order: 0,
        options: [
            { label: "No damage at all", image: "device-images/diagnostics-v3/screen_flawless.webp" },
            { label: "Light surface scratches", image: "device-images/diagnostics-v3/screen_scratches.webp" },
            { label: "Cracked but usable", image: "device-images/diagnostics-v3/screen_cracked.webp" },
            { label: "Shattered", image: "device-images/diagnostics-v3/screen_shattered.webp" },
        ],
    },
    {
        category: "Tablet", key: "body", question: "How is the body / casing?", order: 1,
        options: [
            { label: "Like new", image: "device-images/diagnostics-v3/back_flawless.webp" },
            { label: "Light scratches", image: "device-images/diagnostics-v3/back_minor.webp" },
            { label: "Dents or significant marks", image: "device-images/diagnostics-v3/back_cracked.webp" },
        ],
    },
    {
        category: "Tablet", key: "battery", question: "How's the battery life?", order: 2,
        options: [
            { label: "Holds charge well (6+ hours)", icon: "battery-charging", tone: "success" },
            { label: "Drains a bit fast (3–5 hours)", icon: "battery-medium", tone: "info" },
            { label: "Very poor under 3 hours", icon: "battery-low", tone: "danger" },
        ],
    },
    {
        category: "Tablet", key: "charging", question: "Is the charging port working?", order: 3,
        options: [
            { label: "Yes", icon: "zap", tone: "success" },
            { label: "No / Loose", icon: "zap-off", tone: "danger" },
        ],
    },
    {
        category: "Tablet", key: "reset", question: "Is the tablet factory reset?", order: 4,
        options: [
            { label: "Yes, already reset", icon: "rotate-ccw", tone: "success" },
            { label: "I'll reset before sending", icon: "clock", tone: "info" },
        ],
    },

    // ── Console ────────────────────────────────────────────────────────────
    {
        category: "Console", key: "power", question: "Does the console power on and work?", order: 0,
        options: [
            { label: "Yes, works perfectly", icon: "power-on", tone: "success" },
            { label: "Yes but has some issues", icon: "alert-triangle", tone: "warning" },
            { label: "No, won't power on", icon: "power-off", tone: "danger" },
        ],
    },
    {
        category: "Console", key: "disc", question: "Is the disc drive working?", order: 1,
        options: [
            { label: "Yes, works great", icon: "disc", tone: "success" },
            { label: "No / Faulty", icon: "disc3", tone: "danger" },
            { label: "No disc drive (digital edition)", icon: "disc3", tone: "info" },
        ],
    },
    {
        category: "Console", key: "body", question: "Any visible body damage?", order: 2,
        options: [
            { label: "Like new", image: "device-images/diagnostics-v3/console_flawless.webp" },
            { label: "Minor scratches", image: "device-images/diagnostics-v3/console_minor.webp" },
            { label: "Significant damage", image: "device-images/diagnostics-v3/console_damaged.webp" },
        ],
    },
    {
        category: "Console", key: "reset", question: "Have you done a factory reset?", order: 3,
        options: [
            { label: "Yes, already reset", icon: "rotate-ccw", tone: "success" },
            { label: "I'll reset before sending", icon: "clock", tone: "info" },
        ],
    },

    // ── Laptop ─────────────────────────────────────────────────────────────
    {
        category: "Laptop", key: "power", question: "Does it power on?", order: 0,
        options: [
            { label: "Yes, works perfectly", icon: "power-on", tone: "success" },
            { label: "No", icon: "power-off", tone: "danger" },
        ],
    },
    {
        category: "Laptop", key: "screen", question: "How is the screen?", order: 1,
        options: [
            { label: "No damage", image: "device-images/diagnostics-v3/laptop_screen_flawless.webp" },
            { label: "Minor scratches", image: "device-images/diagnostics-v3/laptop_screen_scratches.webp" },
            { label: "Cracked", image: "device-images/diagnostics-v3/laptop_screen_cracked.webp" },
        ],
    },
    {
        category: "Laptop", key: "input", question: "Are the keyboard and trackpad fully working?", order: 2,
        options: [
            { label: "Yes, all working", icon: "keyboard", tone: "success" },
            { label: "Minor issues", icon: "keyboard", tone: "warning" },
            { label: "Major issues", icon: "keyboard", tone: "danger" },
        ],
    },
    {
        category: "Laptop", key: "battery", question: "How's the battery?", order: 3,
        options: [
            { label: "Holds charge well (4+ hours)", icon: "battery-charging", tone: "success" },
            { label: "Drains quickly (1–3 hours)", icon: "battery-warning", tone: "warning" },
            { label: "Very poor under 1 hour", icon: "battery-low", tone: "danger" },
        ],
    },
    {
        category: "Laptop", key: "body", question: "Any body damage?", order: 4,
        options: [
            { label: "None", image: "device-images/diagnostics-v3/body_flawless.webp" },
            { label: "Minor dents or scratches", image: "device-images/diagnostics-v3/body_minor.webp" },
            { label: "Significant damage", image: "device-images/diagnostics-v3/body_damaged.webp" },
        ],
    },
    {
        category: "Laptop", key: "reset", question: "Have you done a factory reset?", order: 5,
        options: [
            { label: "Yes, already reset", icon: "rotate-ccw", tone: "success" },
            { label: "I'll reset before sending", icon: "clock", tone: "info" },
        ],
    },

    // ── Smartwatch ─────────────────────────────────────────────────────────
    {
        category: "Smartwatch", key: "power", question: "Does the watch power on and function?", order: 0,
        options: [
            { label: "Yes, fully working", icon: "power-on", tone: "success" },
            { label: "Powers on but has screen/sensor issues", icon: "alert-triangle", tone: "warning" },
            { label: "Won't power on", icon: "power-off", tone: "danger" },
        ],
    },
    {
        category: "Smartwatch", key: "screen", question: "How is the screen glass?", order: 1,
        options: [
            { label: "Pristine - no scratches", image: "device-images/diagnostics-v3/screen_flawless.webp" },
            { label: "Light micro-scratches", image: "device-images/diagnostics-v3/screen_scratches.webp" },
            { label: "Deep scratches or chips", image: "device-images/diagnostics-v3/screen_shattered.webp" },
            { label: "Cracked screen", image: "device-images/diagnostics-v3/screen_cracked.webp" },
        ],
    },
    {
        category: "Smartwatch", key: "battery", question: "Does battery hold a normal charge?", order: 2,
        options: [
            { label: "Holds charge well (1+ day)", icon: "battery-charging", tone: "success" },
            { label: "Degraded charge (under 12 hours)", icon: "battery-low", tone: "danger" },
        ],
    },
    {
        category: "Smartwatch", key: "charging", question: "Is the charger working and connecting?", order: 3,
        options: [
            { label: "Yes", icon: "zap", tone: "success" },
            { label: "No / loose connection", icon: "zap-off", tone: "danger" },
        ],
    },
    {
        category: "Smartwatch", key: "reset", question: "Is Activation Lock / iCloud turned off?", order: 4,
        options: [
            { label: "Yes, fully removed", icon: "rotate-ccw", tone: "success" },
            { label: "I will remove before posting", icon: "clock", tone: "info" },
        ],
    },

    // ── Audio ──────────────────────────────────────────────────────────────
    {
        category: "Audio", key: "sound", question: "How is the sound quality?", order: 0,
        options: [
            { label: "Perfect - crisp audio & active ANC", icon: "volume-high", tone: "success" },
            { label: "Muffled sound or static in one ear", icon: "volume-low", tone: "warning" },
            { label: "No sound in one/both ears", icon: "volume-mute", tone: "danger" },
        ],
    },
    {
        category: "Audio", key: "body", question: "How is the cosmetic condition?", order: 1,
        options: [
            { label: "Like new - clean pads/tips", image: "device-images/diagnostics-v3/audio_flawless.webp" },
            { label: "Minor scratches or wear on case", image: "device-images/diagnostics-v3/audio_minor.webp" },
            { label: "Heavy wear or staining", image: "device-images/diagnostics-v3/audio_damaged.webp" },
        ],
    },
    {
        category: "Audio", key: "battery", question: "How is the battery health?", order: 2,
        options: [
            { label: "Excellent charge", icon: "battery-charging", tone: "success" },
            { label: "Low capacity - drains fast", icon: "battery-warning", tone: "warning" },
        ],
    },
    {
        category: "Audio", key: "charging", question: "Does the charging case work?", order: 3,
        options: [
            { label: "Yes, charges fully", icon: "zap", tone: "success" },
            { label: "No / faulty connection", icon: "zap-off", tone: "danger" },
        ],
    },

    // ── Other ──────────────────────────────────────────────────────────────
    {
        category: "Other", key: "power", question: "Does the device power on and work?", order: 0,
        options: [
            { label: "Yes, fully working", icon: "power-on", tone: "success" },
            { label: "Powers on but has issues", icon: "alert-triangle", tone: "warning" },
            { label: "No, won't power on", icon: "power-off", tone: "danger" },
        ],
    },
    {
        category: "Other", key: "physical", question: "What is the physical condition?", order: 1,
        options: [
            { label: "Like new — no damage", image: "device-images/diagnostics-v3/body_flawless.webp" },
            { label: "Minor wear or scratches", image: "device-images/diagnostics-v3/body_minor.webp" },
            { label: "Heavy wear or damage", image: "device-images/diagnostics-v3/body_damaged.webp" },
        ],
    },
    {
        category: "Other", key: "function", question: "Is all functionality working?", order: 2,
        options: [
            { label: "Yes, fully working", icon: "power-on", tone: "success" },
            { label: "Partial issues", icon: "alert-triangle", tone: "warning" },
            { label: "Major issues", icon: "alert-triangle", tone: "warning" },
        ],
    },
    {
        category: "Other", key: "reset", question: "Will you factory reset before sending?", order: 3,
        options: [
            { label: "Yes, already done", icon: "rotate-ccw", tone: "success" },
            { label: "I'll do it before sending", icon: "clock", tone: "info" },
        ],
    },
];
