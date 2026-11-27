---
"@ai-hero/cookout": minor
---

Breaking: reactivating an agent no longer answers a token. `cookout identity reactivate <agent>` and the SDK's `reactivateIdentity` answer `{ identity }` for an agent; its owner makes it an agent key (`cookout agent-key create <agent> <key-name>`) if its services need one, or it joins again. Reactivating a person still answers a fresh token, so `reactivateIdentity`'s answer type is now `IdentityResponse | IdentityWithTokenResponse`. A new agent also stores no Identity token any more.
