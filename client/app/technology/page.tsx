import ManagerShell from "../../components/ManagerShell"
import TechnologyLibrary from "../../components/TechnologyLibrary"
import { t } from "../../i18n"

// The Technology Knowledge Base (screen A10). It is a product-level curated
// asset shared across every workspace, not a stage of any engagement, so it
// sits in the same internal shell as every other consultant surface with its
// own sidebar entry.

export default function TechnologyPage() {
  return (
    <ManagerShell
      title={t("technology.library.title")}
      description={t("technology.library.intro")}
    >
      <TechnologyLibrary />
    </ManagerShell>
  )
}
