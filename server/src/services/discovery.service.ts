import type { DiscoveryProfile } from "../../../shared/discovery-profile.schema.js"

import { updateEngagementDiscovery } from "../repositories/engagement.repository.js"

// Discovery is consultant-authored in Phase 2. Saving is a deterministic
// persisted-state transformation and does not create an Analysis Run.
export const saveDiscoveryProfile = async (
  engagementId: string,
  discoveryProfile: DiscoveryProfile,
) => updateEngagementDiscovery(engagementId, discoveryProfile)
