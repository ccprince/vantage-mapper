import { defineStore } from 'pinia'
import type { GameSession, Location, LocationId, SubMap } from '../types'

export const useAtlasStore = defineStore('atlas', {
  state: () => ({
    locations: {
      '031': {
        id: '031',
        exits: { north: null, south: { kind: 'location', id: '041' }, east: null, west: null },
        hasInterior: false, hasAerial: false, hasUnderground: false, notes: '',
      },
      '040': {
        id: '040',
        exits: { north: null, south: null, east: { kind: 'location', id: '041' }, west: { kind: 'blocked' } },
        hasInterior: false, hasAerial: false, hasUnderground: false, notes: '',
      },
      '041': {
        id: '041',
        exits: {
          north: { kind: 'location', id: '031' },
          south: null,
          east: { kind: 'location', id: '042' },
          west: { kind: 'location', id: '040' },
        },
        hasInterior: false, hasAerial: false, hasUnderground: false, notes: '',
      },
      '042': {
        id: '042',
        exits: {
          north: null,
          south: { kind: 'location', id: '052' },
          east: { kind: 'location', id: '043' },
          west: { kind: 'location', id: '041' },
        },
        hasInterior: true, hasAerial: false, hasUnderground: false, notes: '',
      },
      '043': {
        id: '043',
        exits: {
          north: null,
          south: null,
          east: { kind: 'departure', id: null },
          west: { kind: 'location', id: '042' },
        },
        hasInterior: false, hasAerial: false, hasUnderground: false, notes: '',
      },
      '052': {
        id: '052',
        exits: { north: { kind: 'location', id: '042' }, south: null, east: null, west: { kind: 'blocked' } },
        hasInterior: false, hasAerial: false, hasUnderground: false, notes: '',
      },
    } as Record<LocationId, Location>,

    subMaps: {} as Record<string, SubMap>,

    sessions: [
      {
        id: 'demo-session',
        name: 'Demo Session',
        startedAt: new Date().toISOString(),
        currentLocationId: '042',
        displayCenter: '042',
        floatingRoots: [],
        visitedLocations: ['041', '042', '052'],
        actionTaken: { '042': true },
      },
    ] as GameSession[],

    activeSessionId: 'demo-session' as string | null,
  }),

  getters: {
    activeSession: (state): GameSession | undefined =>
      state.sessions.find(s => s.id === state.activeSessionId),
  },
})
