import { describe, it, expect, beforeEach } from 'vitest'
import {
  useIssueFilterStore,
  getIssueFilterCounts,
} from './issue-filter-store'

describe('useIssueFilterStore', () => {
  beforeEach(() => {
    useIssueFilterStore.setState({
      status: [],
      priority: [],
      type: [],
      labels: [],
      assignees: [],
    })
  })

  describe('initial state', () => {
    it('starts with empty filter arrays on every dimension', () => {
      const state = useIssueFilterStore.getState()
      expect(state.status).toEqual([])
      expect(state.priority).toEqual([])
      expect(state.type).toEqual([])
      expect(state.labels).toEqual([])
      expect(state.assignees).toEqual([])
    })
  })

  describe('toggleStatus', () => {
    it('adds a status when not present', () => {
      useIssueFilterStore.getState().toggleStatus('open')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
    })

    it('removes a status when already present', () => {
      useIssueFilterStore.setState({ status: ['open', 'in_progress'] })
      useIssueFilterStore.getState().toggleStatus('open')
      expect(useIssueFilterStore.getState().status).toEqual(['in_progress'])
    })

    it('preserves order of remaining values', () => {
      useIssueFilterStore.getState().toggleStatus('closed')
      useIssueFilterStore.getState().toggleStatus('open')
      useIssueFilterStore.getState().toggleStatus('closed')
      expect(useIssueFilterStore.getState().status).toEqual(['open'])
    })
  })

  describe('togglePriority', () => {
    it('adds and removes priorities', () => {
      const { togglePriority } = useIssueFilterStore.getState()
      togglePriority('P0')
      togglePriority('P1')
      expect(useIssueFilterStore.getState().priority).toEqual(['P0', 'P1'])
      togglePriority('P0')
      expect(useIssueFilterStore.getState().priority).toEqual(['P1'])
    })
  })

  describe('toggleType', () => {
    it('adds and removes types', () => {
      const { toggleType } = useIssueFilterStore.getState()
      toggleType('bug')
      toggleType('feature')
      expect(useIssueFilterStore.getState().type).toEqual(['bug', 'feature'])
      toggleType('bug')
      expect(useIssueFilterStore.getState().type).toEqual(['feature'])
    })
  })

  describe('toggleLabel', () => {
    it('adds and removes label names', () => {
      const { toggleLabel } = useIssueFilterStore.getState()
      toggleLabel('urgent')
      toggleLabel('frontend')
      expect(useIssueFilterStore.getState().labels).toEqual([
        'urgent',
        'frontend',
      ])
      toggleLabel('urgent')
      expect(useIssueFilterStore.getState().labels).toEqual(['frontend'])
    })
  })

  describe('toggleAssignee', () => {
    it('adds and removes assignees', () => {
      const { toggleAssignee } = useIssueFilterStore.getState()
      toggleAssignee('alice')
      toggleAssignee('bob')
      expect(useIssueFilterStore.getState().assignees).toEqual([
        'alice',
        'bob',
      ])
      toggleAssignee('alice')
      expect(useIssueFilterStore.getState().assignees).toEqual(['bob'])
    })
  })

  describe('clearAll', () => {
    it('empties every dimension in one call', () => {
      useIssueFilterStore.setState({
        status: ['open'],
        priority: ['P0'],
        type: ['bug'],
        labels: ['urgent'],
        assignees: ['alice'],
      })
      useIssueFilterStore.getState().clearAll()
      const s = useIssueFilterStore.getState()
      expect(s.status).toEqual([])
      expect(s.priority).toEqual([])
      expect(s.type).toEqual([])
      expect(s.labels).toEqual([])
      expect(s.assignees).toEqual([])
    })
  })
})

describe('getIssueFilterCounts', () => {
  beforeEach(() => {
    useIssueFilterStore.setState({
      status: [],
      priority: [],
      type: [],
      labels: [],
      assignees: [],
    })
  })

  it('returns zero on every dimension for the default state', () => {
    expect(getIssueFilterCounts()).toEqual({
      status: 0,
      priority: 0,
      type: 0,
      labels: 0,
      assignees: 0,
    })
  })

  it('reflects the current filter state', () => {
    useIssueFilterStore.setState({
      status: ['open', 'in_progress'],
      priority: ['P0'],
      type: ['bug', 'feature', 'task'],
      labels: ['urgent'],
      assignees: [],
    })
    expect(getIssueFilterCounts()).toEqual({
      status: 2,
      priority: 1,
      type: 3,
      labels: 1,
      assignees: 0,
    })
  })
})
