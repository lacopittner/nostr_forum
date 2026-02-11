import { describe, expect, it, vi } from 'vitest';
import type { NDKSubscription } from '@nostr-dev-kit/ndk';
import { SubscriptionManager } from '../lib/subscriptionManager';

function createMockSubscription() {
  const eoseHandlers: Array<() => void> = [];

  const mock = {
    stop: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      if (event === 'eose') {
        eoseHandlers.push(handler);
      }
      return mock as unknown as NDKSubscription;
    }),
    emitEose: () => {
      eoseHandlers.forEach((handler) => handler());
    },
  };

  return mock;
}

describe('SubscriptionManager', () => {
  it('stops all subscriptions in a group', () => {
    const manager = new SubscriptionManager();
    const first = createMockSubscription();
    const second = createMockSubscription();

    manager.add('group', first as unknown as NDKSubscription, second as unknown as NDKSubscription);
    expect(manager.has('group')).toBe(true);

    manager.stop('group');

    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.stop).toHaveBeenCalledTimes(1);
    expect(manager.has('group')).toBe(false);
  });

  it('replaces previous group subscriptions', () => {
    const manager = new SubscriptionManager();
    const previous = createMockSubscription();
    const next = createMockSubscription();

    manager.add('group', previous as unknown as NDKSubscription);
    manager.replace('group', next as unknown as NDKSubscription);

    expect(previous.stop).toHaveBeenCalledTimes(1);
    expect(next.stop).not.toHaveBeenCalled();
  });

  it('stops matching groups only', () => {
    const manager = new SubscriptionManager();
    const reaction = createMockSubscription();
    const feed = createMockSubscription();

    manager.add('feed:reaction:1', reaction as unknown as NDKSubscription);
    manager.add('feed:stream', feed as unknown as NDKSubscription);

    manager.stopMatching((key) => key.startsWith('feed:reaction:'));

    expect(reaction.stop).toHaveBeenCalledTimes(1);
    expect(feed.stop).not.toHaveBeenCalled();
  });

  it('clears internal group set after stopMatching', () => {
    const manager = new SubscriptionManager();
    const reaction = createMockSubscription();

    manager.add('feed:reaction:1', reaction as unknown as NDKSubscription);

    const groupsRef = (manager as unknown as { groups: Map<string, Set<NDKSubscription>> }).groups;
    const groupRef = groupsRef.get('feed:reaction:1');
    expect(groupRef).toBeDefined();

    manager.stopMatching((key) => key.startsWith('feed:reaction:'));

    expect(reaction.stop).toHaveBeenCalledTimes(1);
    expect(groupRef?.size).toBe(0);
    expect(groupsRef.has('feed:reaction:1')).toBe(false);
  });

  it('tracks a pair and stops after both eose events', () => {
    const manager = new SubscriptionManager();
    const first = createMockSubscription();
    const second = createMockSubscription();

    manager.trackPairUntilEose(
      'pair',
      first as unknown as NDKSubscription,
      second as unknown as NDKSubscription
    );

    first.emitEose();
    expect(first.stop).not.toHaveBeenCalled();
    expect(second.stop).not.toHaveBeenCalled();

    second.emitEose();
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.stop).toHaveBeenCalledTimes(1);
    expect(manager.has('pair')).toBe(false);
  });
});
