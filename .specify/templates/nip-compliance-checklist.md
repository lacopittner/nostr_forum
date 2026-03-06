# NIP Compliance Checklist: [FEATURE NAME]

**Purpose**: Validate Nostr protocol compliance before implementation
**Created**: [DATE]
**Feature**: [Link to spec.md]

## NIP Usage

| NIP | Purpose | Required | Implemented |
|-----|---------|----------|-------------|
| NIP-01 | Basic protocol (kinds, tags, relay info) | Yes | [ ] |
| NIP-02 | Contact List (kind: 3) | No | [ ] |
| NIP-04 | Direct Messages (kind: 4) | No | [ ] |
| NIP-05 | DNS-based verification | No | [ ] |
| NIP-07 | Extension signer | Yes | [ ] |
| NIP-09 | Event deletions (kind: 5) | No | [ ] |
| NIP-10 | Comment threading (e-tags) | If comments | [ ] |
| NIP-12 | Generic tag queries | No | [ ] |
| NIP-18 | Reposts (kind: 6) | No | [ ] |
| NIP-25 | Reactions (kind: 7) | If voting | [ ] |
| NIP-26 | Restricted/signed event kinds | No | [ ] |
| NIP-40 | Expiration timestamp | No | [ ] |
| NIP-46 | Remote signer (Bunker/connect) | If NIP-07 unavailable | [ ] |
| NIP-50 | Search functionality | No | [ ] |
| NIP-51 | Mute/interest lists (kind: 10000/30000) | If muting | [ ] |
| NIP-65 | Relay list metadata (kind: 10002) | If relay mgmt | [ ] |
| NIP-72 | Communities (kind: 34550) | If communities | [ ] |
| NIP-94 | File metadata (kind: 1063) | If file upload | [ ] |
| NIP-98 | HTTP Auth (kind: 27235) | If uploads | [ ] |

## Kind & Tag Validation

- [ ] Uses correct event kind numbers
- [ ] All required tags present and formatted correctly
- [ ] Proper `d` tag usage for parameterized events
- [ ] Correct `e` tag markers (`root`, `reply`)
- [ ] Proper `a` tag format (`kind:dpubkey:relay`)
- [ ] `p` tags include recommended `relay` and `petname` metadata

## Signature & Security

- [ ] Events signed with correct key
- [ ] NIP-98 authorization header for HTTP requests
- [ ] No plaintext private keys stored
- [ ] Extension/NIP-46 signer preferred over local keys
- [ ] User content sanitized before rendering

## Relay Compatibility

- [ ] Publishes to appropriate relays
- [ ] Handles relay failures gracefully
- [ ] Subscription filters use correct syntax
- [ ] Supports relay-side search (NIP-50) when available

## Testing

- [ ] Unit tests for event creation
- [ ] Tag parsing validation tests
- [ ] E2E tests for user flows
- [ ] Relay failure simulation tests

## Notes

- Items marked incomplete require fixes before implementation proceeds
- Consult [nostr-protocol-nips](https://github.com/nostr-protocol/nips) for canonical references
