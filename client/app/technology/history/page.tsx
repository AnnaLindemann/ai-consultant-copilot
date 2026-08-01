import ManagerShell from "../../../components/ManagerShell"
import TechnologyUpdateHistoryView from "../../../components/TechnologyUpdateHistoryView"
import { t } from "../../../i18n"

// Technology Update History (screen A12) — the append-only record of approved,
// applied changes. Read-only by construction: no route can edit or remove an
// entry.

export default function TechnologyHistoryPage() {
  return (
    <ManagerShell
      breadcrumbs={[{ label: t("technology.library.title"), href: "/technology" }]}
      title={t("technology.history.title")}
      description={t("technology.history.intro")}
    >
      <TechnologyUpdateHistoryView />
    </ManagerShell>
  )
}
