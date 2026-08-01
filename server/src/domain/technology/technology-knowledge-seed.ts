import type {
  TechnologyCategory,
  TechnologyProfile,
  TechnologySource,
} from "../../../../shared/technology-knowledge.schema.js"

// The initial content the Technology Knowledge Base ships with.
//
// Three registries, and they are deliberately different in kind:
//
//  - **Technology Categories** — the approved organizing set (domain-model.md
//    §4.2). Curated data rather than hard-coded types, so the set is extensible
//    without a code change.
//  - **Technology Sources** — the trusted official origins a proposal may cite.
//    A registry of *where information officially comes from*, not content.
//  - **Technology Profiles** — the initial product catalogue.
//
// The seed runs only into an *empty* knowledge base and never again, exactly as
// the Consulting Knowledge Base's does, so a curator's work is never overwritten
// by a restart.
//
// **The seed is the initial catalogue, not a bypass of the curator.** After it,
// every addition and every modification goes through propose → human approval →
// apply → history. There is no other write path.
//
// Two rules govern the profile content below. It carries **durable consulting
// knowledge, not marketing**: role, strengths, limitations, and suitability
// stated in terms that stay true as versions change, so a profile remains
// reusable by later Recommendation, Roadmap, and Report stages. And it contains
// **no invented specifics** — no context windows, no prices, no benchmark
// claims, no comparative superlatives — because those churn, and a figure the
// product cannot stand behind is worse than an absent one (agent-rules.md §12).

// The approved category set (domain-model.md §4.2; architecture.md §9.2). The
// sort order is the curator's reading order, not a ranking.
export const technologyCategorySeed: TechnologyCategory[] = [
  {
    code: "ai-models",
    title: "AI Models",
    summary:
      "Die Modelle selbst — insbesondere Sprachmodelle — mit ihren Fähigkeiten und Einsatzgrenzen.",
    sortOrder: 1,
    active: true,
    revision: 0,
  },
  {
    code: "ai-providers",
    title: "AI Providers",
    summary:
      "Anbieter und Plattformen, die Modelle bereitstellen, mit ihren Schnittstellen und Vertragsbedingungen.",
    sortOrder: 2,
    active: true,
    revision: 0,
  },
  {
    code: "embedding-models",
    title: "Embedding Models",
    summary: "Modelle für semantische Repräsentation und Ähnlichkeitssuche.",
    sortOrder: 3,
    active: true,
    revision: 0,
  },
  {
    code: "speech",
    title: "Speech",
    summary: "Sprache-zu-Text- und Text-zu-Sprache-Technologien.",
    sortOrder: 4,
    active: true,
    revision: 0,
  },
  {
    code: "ocr",
    title: "OCR",
    summary: "Texterkennung und Dokumentenverständnis.",
    sortOrder: 5,
    active: true,
    revision: 0,
  },
  {
    code: "vector-databases",
    title: "Vector Databases",
    summary: "Speicher für Vektoren und semantische Suche.",
    sortOrder: 6,
    active: true,
    revision: 0,
  },
  {
    code: "rerankers",
    title: "Rerankers",
    summary: "Modelle, die die Trefferqualität einer Suche nachträglich verbessern.",
    sortOrder: 7,
    active: true,
    revision: 0,
  },
  {
    code: "mcp-servers",
    title: "MCP Servers",
    summary:
      "Model-Context-Protocol-Server und andere Werkzeuganbindungen für Modelle.",
    sortOrder: 8,
    active: true,
    revision: 0,
  },
  {
    code: "browser-computer-use",
    title: "Browser / Computer Use",
    summary:
      "Frameworks, mit denen Modelle Browser oder Arbeitsplatzoberflächen bedienen.",
    sortOrder: 9,
    active: true,
    revision: 0,
  },
  {
    code: "workflow-engines",
    title: "Workflow Engines",
    summary: "Orchestrierung von Abläufen zwischen Systemen und Modellen.",
    sortOrder: 10,
    active: true,
    revision: 0,
  },
  {
    code: "evaluation-frameworks",
    title: "Evaluation Frameworks",
    summary: "Frameworks zur Bewertung von KI-Systemen und ihren Ausgaben.",
    sortOrder: 11,
    active: true,
    revision: 0,
  },
  {
    code: "monitoring",
    title: "Monitoring",
    summary: "Beobachtbarkeit und Überwachung von KI-Systemen im Betrieb.",
    sortOrder: 12,
    active: true,
    revision: 0,
  },
  {
    code: "deployment-patterns",
    title: "Deployment Patterns",
    summary: "Wiederverwendbare Muster für Betrieb und Auslieferung von KI-Lösungen.",
    sortOrder: 13,
    active: true,
    revision: 0,
  },
]

// The trusted official origins. A Technology Update Proposal may cite only
// entries from this registry — provenance that is not in it is provenance the
// product cannot vouch for (agent-rules.md §4.1).
//
// A source is *where information officially comes from*. It is deliberately
// distinct from the AI Providers category, which is curated content used in
// recommendations: OpenAI appears in both, playing two different roles.
export const technologySourceSeed: TechnologySource[] = [
  {
    code: "openai",
    name: "OpenAI",
    summary: "Offizielle Ankündigungen, Model Cards und Dokumentation von OpenAI.",
    officialChannels: [
      { label: "Ankündigungen", url: "https://openai.com/news/" },
      { label: "Dokumentation", url: "https://platform.openai.com/docs" },
    ],
    active: true,
    revision: 0,
  },
  {
    code: "anthropic",
    name: "Anthropic",
    summary: "Offizielle Ankündigungen, Model Cards und Dokumentation von Anthropic.",
    officialChannels: [
      { label: "Ankündigungen", url: "https://www.anthropic.com/news" },
      { label: "Dokumentation", url: "https://docs.anthropic.com" },
    ],
    active: true,
    revision: 0,
  },
  {
    code: "google",
    name: "Google",
    summary: "Offizielle Ankündigungen und Dokumentation zu Google-KI-Modellen.",
    officialChannels: [
      { label: "Ankündigungen", url: "https://blog.google/technology/ai/" },
      { label: "Dokumentation", url: "https://ai.google.dev/docs" },
    ],
    active: true,
    revision: 0,
  },
  {
    code: "meta",
    name: "Meta",
    summary: "Offizielle Ankündigungen und Model Cards zu Meta-KI-Modellen.",
    officialChannels: [
      { label: "Ankündigungen", url: "https://ai.meta.com/blog/" },
    ],
    active: true,
    revision: 0,
  },
  {
    code: "groq",
    name: "Groq",
    summary: "Offizielle Ankündigungen und Dokumentation von Groq.",
    officialChannels: [{ label: "Dokumentation", url: "https://console.groq.com/docs" }],
    active: true,
    revision: 0,
  },
  {
    code: "mistral",
    name: "Mistral AI",
    summary: "Offizielle Ankündigungen und Dokumentation von Mistral AI.",
    officialChannels: [
      { label: "Ankündigungen", url: "https://mistral.ai/news/" },
      { label: "Dokumentation", url: "https://docs.mistral.ai" },
    ],
    active: true,
    revision: 0,
  },
  {
    code: "microsoft",
    name: "Microsoft",
    summary: "Offizielle Dokumentation zu Azure-KI-Diensten.",
    officialChannels: [
      {
        label: "Dokumentation",
        url: "https://learn.microsoft.com/azure/ai-services/openai/",
      },
    ],
    active: true,
    revision: 0,
  },
  {
    code: "postgresql",
    name: "PostgreSQL",
    summary: "Offizielle Dokumentation des PostgreSQL-Projekts.",
    officialChannels: [{ label: "Dokumentation", url: "https://www.postgresql.org/docs/" }],
    active: true,
    revision: 0,
  },
  {
    code: "supabase",
    name: "Supabase",
    summary: "Offizielle Dokumentation von Supabase.",
    officialChannels: [{ label: "Dokumentation", url: "https://supabase.com/docs" }],
    active: true,
    revision: 0,
  },
  {
    code: "pinecone",
    name: "Pinecone",
    summary: "Offizielle Dokumentation von Pinecone.",
    officialChannels: [{ label: "Dokumentation", url: "https://docs.pinecone.io" }],
    active: true,
    revision: 0,
  },
  {
    code: "n8n",
    name: "n8n",
    summary: "Offizielle Dokumentation von n8n.",
    officialChannels: [{ label: "Dokumentation", url: "https://docs.n8n.io" }],
    active: true,
    revision: 0,
  },
  {
    code: "zapier",
    name: "Zapier",
    summary: "Offizielle Dokumentation von Zapier.",
    officialChannels: [{ label: "Dokumentation", url: "https://help.zapier.com" }],
    active: true,
    revision: 0,
  },
]

// The initial product catalogue: well-established technologies the product is
// expected to be able to recommend, described in durable terms.
export const technologyProfileSeed: TechnologyProfile[] = [
  {
    code: "openai-gpt-5",
    categoryCode: "ai-models",
    title: "OpenAI GPT-5",
    summary:
      "Großes Sprachmodell von OpenAI für Textverständnis, Texterzeugung, Klassifikation und Werkzeugaufrufe.",
    details: {
      role: "Sprachmodell für Verstehen, Erzeugen und Strukturieren von Text in Kundenprozessen.",
      strengths: [
        "Versteht unstrukturierte Kundenkommunikation und überführt sie in strukturierte Felder",
        "Erzeugt Entwürfe für Antworten, Zusammenfassungen und Klassifikationen",
        "Unterstützt Werkzeugaufrufe, sodass Systemaktionen kontrolliert angestoßen werden können",
      ],
      limitations: [
        "Ausgaben sind nicht deterministisch und müssen bei fachlicher Relevanz geprüft werden",
        "Faktentreue entsteht erst durch bereitgestellten Kontext, nicht durch das Modell allein",
        "Verarbeitung erfolgt beim Anbieter; Datenschutz und Auftragsverarbeitung sind gesondert zu klären",
      ],
      suitability: [
        "Triage und Klassifikation eingehender Anfragen",
        "Entwurf von Antworten mit menschlicher Freigabe",
        "Zusammenfassung langer Vorgangshistorien",
      ],
    },
    matchTerms: [
      "gpt",
      "gpt 5",
      "openai",
      "sprachmodell",
      "llm",
      "textgenerierung",
      "chatbot",
    ],
    tags: ["llm", "openai", "text"],
    status: "active",
    sortOrder: 1,
    origin: "product_seed",
    originSourceCodes: ["openai"],
    revision: 0,
  },
  {
    code: "anthropic-claude",
    categoryCode: "ai-models",
    title: "Anthropic Claude",
    summary:
      "Sprachmodellfamilie von Anthropic für Textverständnis, Texterzeugung und werkzeuggestützte Abläufe.",
    details: {
      role: "Sprachmodell für Analyse und Erzeugung von Text mit Schwerpunkt auf nachvollziehbarem Antwortverhalten.",
      strengths: [
        "Arbeitet zuverlässig mit langen, zusammenhängenden Vorgangskontexten",
        "Folgt strukturierten Ausgabeformaten, was die maschinelle Weiterverarbeitung erleichtert",
        "Unterstützt Werkzeugaufrufe für kontrollierte Systemzugriffe",
      ],
      limitations: [
        "Ausgaben sind nicht deterministisch und bleiben ein zu prüfender Entwurf",
        "Benötigt bereitgestellten Kontext, um fachlich korrekt zu antworten",
        "Verarbeitung erfolgt beim Anbieter; Datenschutzfragen sind gesondert zu klären",
      ],
      suitability: [
        "Analyse und Strukturierung umfangreicher Fallakten",
        "Entwurf erklärender Antworten bei Rückfragen zu Vorgängen",
        "Prüfschritte, in denen Begründungen sichtbar bleiben sollen",
      ],
    },
    matchTerms: ["claude", "anthropic", "sprachmodell", "llm"],
    tags: ["llm", "anthropic", "text"],
    status: "active",
    sortOrder: 2,
    origin: "product_seed",
    originSourceCodes: ["anthropic"],
    revision: 0,
  },
  {
    code: "google-gemini",
    categoryCode: "ai-models",
    title: "Google Gemini",
    summary:
      "Sprachmodellfamilie von Google für Text- und multimodale Verarbeitung.",
    details: {
      role: "Sprachmodell für Text- und gemischte Inhalte innerhalb der Google-Plattform.",
      strengths: [
        "Verarbeitet neben Text auch Bild- und Dokumentinhalte",
        "Ist über die Google-Cloud-Plattform betrieblich anbindbar",
        "Unterstützt strukturierte Ausgaben und Werkzeugaufrufe",
      ],
      limitations: [
        "Ausgaben sind nicht deterministisch und bleiben ein zu prüfender Entwurf",
        "Anbindung ist an das Google-Cloud-Ökosystem gebunden",
        "Verarbeitung erfolgt beim Anbieter; Datenschutzfragen sind gesondert zu klären",
      ],
      suitability: [
        "Vorgänge, in denen Dokumente und Text gemeinsam bewertet werden",
        "Organisationen, die bereits auf der Google-Cloud-Plattform arbeiten",
      ],
    },
    matchTerms: ["gemini", "google", "sprachmodell", "llm", "multimodal"],
    tags: ["llm", "google", "multimodal"],
    status: "active",
    sortOrder: 3,
    origin: "product_seed",
    originSourceCodes: ["google"],
    revision: 0,
  },
  {
    code: "openai-embeddings",
    categoryCode: "embedding-models",
    title: "OpenAI Embeddings",
    summary:
      "Einbettungsmodelle von OpenAI zur semantischen Repräsentation von Text für Suche und Ähnlichkeitsvergleiche.",
    details: {
      role: "Wandelt Text in Vektoren um, damit inhaltlich ähnliche Vorgänge gefunden werden können.",
      strengths: [
        "Findet inhaltlich verwandte Texte auch ohne wörtliche Übereinstimmung",
        "Lässt sich mit gängigen Vektorspeichern kombinieren",
        "Einmal erzeugte Vektoren sind wiederverwendbar und günstig abzufragen",
      ],
      limitations: [
        "Ein Modellwechsel erfordert das Neuberechnen des gesamten Bestands",
        "Semantische Nähe ist keine fachliche Korrektheit; Treffer bleiben Vorschläge",
        "Verarbeitung erfolgt beim Anbieter; Datenschutzfragen sind gesondert zu klären",
      ],
      suitability: [
        "Ähnlichkeitssuche über frühere Vorgänge und Lösungen",
        "Semantische Suche in Wissens- und Hilfeartikeln",
        "Gruppierung wiederkehrender Anfragetypen",
      ],
    },
    matchTerms: [
      "embedding",
      "embeddings",
      "einbettung",
      "semantische suche",
      "ähnlichkeitssuche",
      "vektor",
    ],
    tags: ["embedding", "openai", "retrieval"],
    status: "active",
    sortOrder: 1,
    origin: "product_seed",
    originSourceCodes: ["openai"],
    revision: 0,
  },
  {
    code: "azure-openai",
    categoryCode: "ai-providers",
    title: "Azure OpenAI",
    summary:
      "Bereitstellung von OpenAI-Modellen über Microsoft Azure mit Azure-eigener Vertrags- und Betriebsumgebung.",
    details: {
      role: "Anbieterplattform, über die OpenAI-Modelle innerhalb einer Azure-Umgebung genutzt werden.",
      strengths: [
        "Ermöglicht die Wahl einer Region für die Verarbeitung",
        "Fügt sich in bestehende Azure-Verträge, -Identitäten und -Netzwerke ein",
        "Erlaubt Betrieb innerhalb einer bereits geprüften Unternehmensumgebung",
      ],
      limitations: [
        "Modellverfügbarkeit kann je Region abweichen und der direkten Anbieterverfügbarkeit nachlaufen",
        "Setzt eine bestehende oder aufzubauende Azure-Umgebung voraus",
        "Bindet die Lösung an einen Plattformanbieter",
      ],
      suitability: [
        "Organisationen mit Azure als bestehender Unternehmensplattform",
        "Vorhaben mit ausdrücklichen Anforderungen an Verarbeitungsregion und Vertragsrahmen",
      ],
    },
    matchTerms: ["azure", "azure openai", "microsoft", "cloud"],
    tags: ["provider", "azure", "microsoft"],
    status: "active",
    sortOrder: 1,
    origin: "product_seed",
    originSourceCodes: ["microsoft"],
    revision: 0,
  },
  {
    code: "postgresql",
    categoryCode: "vector-databases",
    title: "PostgreSQL",
    summary:
      "Relationale Datenbank, die über die Erweiterung pgvector auch Vektorsuche im selben System bereitstellt.",
    details: {
      role: "Datenhaltung für Fach- und Vektordaten in einem System.",
      strengths: [
        "Hält Fachdaten und Vektoren gemeinsam, ohne zweiten Datenspeicher",
        "Ist weit verbreitet, sodass Betriebswissen meist bereits vorhanden ist",
        "Erlaubt es, Filterbedingungen und Ähnlichkeitssuche in einer Abfrage zu verbinden",
      ],
      limitations: [
        "Vektorsuche erfordert die zusätzliche Erweiterung pgvector",
        "Bei sehr großen Vektorbeständen ist Indexierung und Betrieb eigens auszulegen",
        "Kein spezialisierter Funktionsumfang eines reinen Vektordienstes",
      ],
      suitability: [
        "Lösungen, die ohnehin eine relationale Datenbank benötigen",
        "Vorhaben, die einen zusätzlichen Spezialdienst vermeiden wollen",
      ],
    },
    matchTerms: ["postgres", "postgresql", "pgvector", "datenbank", "relational"],
    tags: ["database", "postgres", "vector"],
    status: "active",
    sortOrder: 1,
    origin: "product_seed",
    originSourceCodes: ["postgresql"],
    revision: 0,
  },
  {
    code: "pinecone",
    categoryCode: "vector-databases",
    title: "Pinecone",
    summary: "Verwalteter Vektordatenbankdienst für semantische Suche.",
    details: {
      role: "Spezialisierter Speicher für Vektoren und deren Abfrage.",
      strengths: [
        "Als verwalteter Dienst ohne eigenen Datenbankbetrieb nutzbar",
        "Auf Ähnlichkeitssuche über große Bestände ausgelegt",
        "Unterstützt Filterung anhand mitgeführter Metadaten",
      ],
      limitations: [
        "Zusätzlicher externer Dienst neben der bestehenden Datenhaltung",
        "Fachdaten und Vektoren liegen getrennt und müssen konsistent gehalten werden",
        "Bindet die Lösung an einen Anbieter",
      ],
      suitability: [
        "Große Vektorbestände mit hohen Abfrageanforderungen",
        "Teams ohne Kapazität für eigenen Datenbankbetrieb",
      ],
    },
    matchTerms: ["pinecone", "vektordatenbank", "vector database"],
    tags: ["vector", "managed", "retrieval"],
    status: "active",
    sortOrder: 2,
    origin: "product_seed",
    originSourceCodes: ["pinecone"],
    revision: 0,
  },
  {
    code: "supabase",
    categoryCode: "vector-databases",
    title: "Supabase",
    // Described in its role as a **vector store**, which is the category it is
    // classified under. Supabase brings more than that, but a profile sits
    // under exactly one category and describes the technology's role *within
    // that kind* (domain-model.md §4.2); its wider platform scope belongs in
    // the limitations, as a consequence of adopting it for this purpose.
    summary:
      "Verwaltete PostgreSQL-Instanz, die Vektorsuche über die Erweiterung pgvector bereitstellt.",
    details: {
      role: "Verwalteter Vektorspeicher auf PostgreSQL-Basis.",
      strengths: [
        "Vektorsuche ohne eigenen Datenbankbetrieb, da die Instanz verwaltet wird",
        "Nutzt PostgreSQL und pgvector, sodass bestehendes Datenbankwissen anwendbar bleibt",
        "Hält Fachdaten und Vektoren gemeinsam in einer Instanz",
      ],
      limitations: [
        "Der Vektorspeicher ist nur als Teil der Gesamtplattform beziehbar",
        "Für sehr große Vektorbestände gelten dieselben Auslegungsfragen wie bei PostgreSQL",
        "Betriebsort und Datenschutzfragen richten sich nach der gewählten Betriebsform",
      ],
      suitability: [
        "Semantische Suche in frühen Ausbaustufen ohne eigenen Datenbankbetrieb",
        "Vorhaben, die Fachdaten und Vektoren in einem System halten wollen",
      ],
    },
    matchTerms: ["supabase", "pgvector", "verwaltete datenbank"],
    tags: ["vector", "postgres", "managed"],
    status: "active",
    sortOrder: 3,
    origin: "product_seed",
    originSourceCodes: ["supabase"],
    revision: 0,
  },
  {
    code: "n8n",
    categoryCode: "workflow-engines",
    title: "n8n",
    summary:
      "Workflow-Automatisierung mit visuellem Editor, die selbst betrieben oder als Dienst genutzt werden kann.",
    details: {
      role: "Orchestriert Abläufe zwischen Fachsystemen, Modellen und Freigabeschritten.",
      strengths: [
        "Kann im eigenen Betrieb laufen, sodass Daten die Umgebung nicht verlassen müssen",
        "Bildet Abläufe sichtbar ab und macht sie damit für Fachbereiche nachvollziehbar",
        "Erlaubt eigene Erweiterungen, wenn ein fertiger Baustein fehlt",
      ],
      limitations: [
        "Eigenbetrieb erfordert Verantwortung für Verfügbarkeit und Aktualisierung",
        "Umfangreiche Abläufe werden ohne Konventionen schnell unübersichtlich",
        "Fehlerbehandlung und Wiederanlauf sind bewusst zu entwerfen",
      ],
      suitability: [
        "Abläufe mit menschlichen Freigabeschritten",
        "Organisationen mit Anforderungen an eigenen Betrieb der Verarbeitung",
      ],
    },
    matchTerms: ["n8n", "workflow", "automatisierung", "orchestrierung", "ablauf"],
    tags: ["workflow", "automation", "self-hosted"],
    status: "active",
    sortOrder: 1,
    origin: "product_seed",
    originSourceCodes: ["n8n"],
    revision: 0,
  },
  {
    code: "zapier",
    categoryCode: "workflow-engines",
    title: "Zapier",
    summary:
      "Cloud-Dienst zur Automatisierung zwischen verbreiteten Geschäftsanwendungen ohne eigene Entwicklung.",
    details: {
      role: "Verbindet bestehende Anwendungen zu einfachen, regelbasierten Abläufen.",
      strengths: [
        "Sehr viele fertige Anbindungen an verbreitete Geschäftsanwendungen",
        "Ohne Entwicklungsaufwand einsetzbar, auch durch Fachbereiche",
        "Schnell nutzbar für einen ersten belastbaren Nachweis",
      ],
      limitations: [
        "Verarbeitung erfolgt im Dienst des Anbieters, was bei sensiblen Daten zu prüfen ist",
        "Komplexe Verzweigungen und Sonderfälle stoßen an Grenzen",
        "Betriebskosten wachsen mit dem Ausführungsvolumen",
      ],
      suitability: [
        "Einfache Weiterleitungen zwischen Standardanwendungen",
        "Pilotvorhaben, die den Nutzen zeigen sollen, bevor investiert wird",
      ],
    },
    matchTerms: ["zapier", "automatisierung", "integration", "no-code"],
    tags: ["workflow", "automation", "saas"],
    status: "active",
    sortOrder: 2,
    origin: "product_seed",
    originSourceCodes: ["zapier"],
    revision: 0,
  },
]
