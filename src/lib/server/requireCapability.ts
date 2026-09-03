// HydraSkript - Server-side tier gating guard
// Used by API routes and UI to enforce tier capabilities

import { Capability, TierEntitlements } from '@/config/entitlements'
import { db } from '@/lib/db'

/** 
 * Check if a profile has a specific capability 
 * Returns true if the user's tier allows the capability
 */
export async function requireCapability(
  profileId: string,
  capability: Capability
): Promise<boolean> {
  try {
    const profile = await db.profile.findUnique({
      where: { id: profileId }
    })
    if (!profile) return false
    
    const entitlements = getTierEntitlements(profile.tier)
    const cap = entitlements[capability as keyof TierEntitlements]
    const allowed = cap === -1 || (typeof cap === 'number' && cap > 0)
    
    if (!allowed) {
      console.log(`[Entitlements] Profile ${profileId} tier ${profile.tier} does not have: ${capability}`)
    }
    
    return allowed
  } catch (error) {
    console.error('[Entitlements] requireCapability error:', error)
    return false
  }
}

/** 
 * Get entitlements for a given tier 
 */
function getTierEntitlements(tier: string): TierEntitlements {
  const tierMap: Record<string, TierEntitlements> = {
    free: { activeBooks: 1, styleTraining: false, editorialReview: false, seriesUniverse: false, audiobook: false, exportEpub: false, exportPdf: true, exportDocx: false, apiAccess: false, teamSeats: 0 },
    starter: { activeBooks: 3, styleTraining: false, editorialReview: false, seriesUniverse: false, audiobook: false, exportEpub: true, exportPdf: true, exportDocx: false, apiAccess: false, teamSeats: 0 },
    author: { activeBooks: 10, styleTraining: true, editorialReview: true, seriesUniverse: true, audiobook: true, exportEpub: true, exportPdf: true, exportDocx: true, apiAccess: false, teamSeats: 0 },
    publisher: { activeBooks: 30, styleTraining: true, editorialReview: true, seriesUniverse: true, audiobook: true, exportEpub: true, exportPdf: true, exportDocx: true, apiAccess: true, teamSeats: 0 },
    studio: { activeBooks: -1, styleTraining: true, editorialReview: true, seriesUniverse: true, audiobook: true, exportEpub: true, exportPdf: true, exportDocx: true, apiAccess: true, teamSeats: 5 },
  }
  
  return tierMap[tier] || { activeBooks: 1, styleTraining: false, editorialReview: false, seriesUniverse: false, audiobook: false, exportEpub: false, exportPdf: false, exportDocx: false, apiAccess: false, teamSeats: 0 }
}
