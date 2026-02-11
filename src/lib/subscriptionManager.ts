import { NDKSubscription } from "@nostr-dev-kit/ndk";

export class SubscriptionManager {
  private groups = new Map<string, Set<NDKSubscription>>();

  private stopGroup(key: string, group: Set<NDKSubscription>): void {
    group.forEach((subscription) => subscription.stop());
    group.clear();
    this.groups.delete(key);
  }

  public has(key: string): boolean {
    return this.groups.has(key);
  }

  public add(key: string, ...subscriptions: NDKSubscription[]): void {
    if (subscriptions.length === 0) return;

    const existing = this.groups.get(key) ?? new Set<NDKSubscription>();
    subscriptions.forEach((subscription) => existing.add(subscription));
    this.groups.set(key, existing);
  }

  public replace(key: string, ...subscriptions: NDKSubscription[]): void {
    this.stop(key);
    this.add(key, ...subscriptions);
  }

  public stop(key: string): void {
    const group = this.groups.get(key);
    if (!group) return;

    this.stopGroup(key, group);
  }

  public stopMatching(predicate: (key: string) => boolean): void {
    Array.from(this.groups.entries()).forEach(([key, group]) => {
      if (!predicate(key)) return;
      this.stopGroup(key, group);
    });
  }

  public stopAll(): void {
    this.stopMatching(() => true);
  }

  public trackPairUntilEose(key: string, first: NDKSubscription, second: NDKSubscription): void {
    this.replace(key, first, second);

    let firstEose = false;
    let secondEose = false;

    const stopWhenBothDone = () => {
      if (firstEose && secondEose) {
        this.stop(key);
      }
    };

    first.on("eose", () => {
      firstEose = true;
      stopWhenBothDone();
    });

    second.on("eose", () => {
      secondEose = true;
      stopWhenBothDone();
    });
  }
}
