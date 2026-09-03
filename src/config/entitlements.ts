// HydraSkript - Entitlements Configuration
// Maps each tier to capabilities/booleans and per-month limits

export type Capability = 
  | 'activeBooks' 
  | 'styleTraining' 
  | 'editorialReview' 
  | 'seriesUniverse' 
  | 'audiobook' 
  | 'exportEpub' 
  | 'exportPdf' 
  | 'exportDocx' 
  | 'apiAccess' 
  | 'teamSeats'

export interface TierEntitlements {
  readonly activeBooks: number
  readonly styleTraining: boolean
  readonly editorialReview: boolean
  readonly seriesUniverse: boolean
  readonly audiobook: boolean
  readonly exportEpub: boolean
  readonly exportPdf: boolean
  readonly exportDocx: boolean
  readonly apiAccess: boolean
  readonly teamSeats: number
}
