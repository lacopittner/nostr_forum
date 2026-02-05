# Nostr Forum - Plán Vylepšení

## 📋 Súčasný Stav

Tvoj projekt je už veľmi pokročilý:
- ✅ Komunity (NIP-72, Kind 34550)
- ✅ Príspevky, komentáre, upvoty/downvoty
- ✅ Moderátori, blokovanie užívateľov
- ✅ Wiki, flairy pre komunity
- ✅ Zaps (Lightning payments)
- ✅ Ukladanie príspevkov
- ✅ Dark/light theme
- ✅ Search, profily

---

## 🚨 Kritické Problémy (Bezpečnosť)

### 1. Hardcoded Private Key ⚠️ KRITICKÉ
**Súbor:** `src/lib/ndk.ts`
**Problém:** Developer privátny kľúč je v kóde
**Riešenie:** Presunúť do .env alebo secure storage

### 2. Missing Error Boundaries
**Súbor:** Niektoré komponenty nemajú try-catch
**Riešenie:** Pridať ErrorBoundary wrappery

### 3. Memory Leaks v Subscriptions
**Problém:** Subscription sa nemusia správne cleanup-ovať
**Riešenie:** Lepšie useEffect cleanup

---

## 🎨 Vylepšenia UI/UX

### Responzívny Dizajn (Mobile-First)
1. **AppShell.tsx**
   - [ ] Lepšia mobilná navigácia (bottom nav)
   - [ ] Collapsible sidebar
   - [ ] Touch-friendly tlačidlá (min 44px)
   - [ ] Optimalizované font sizes pre mobile

2. **Feed/Post Cards**
   - [ ] Kompaktnejšie na mobile
   - [ ] Swipe gestures (swipe to vote)
   - [ ] Better image handling

3. **Community Detail Page**
   - [ ] Sticky header na mobile
   - [ ] Tab navigácia (Posts | About | Wiki)

### Performance
1. **Virtualized Lists**
   - [ ] react-window alebo react-virtual pre dlhé feedy
   
2. **Image Optimization**
   - [ ] Lazy loading obrázkov
   - [ ] Placeholders
   
3. **Code Splitting**
   - [ ] Dynamic imports pre modaly
   - [ ] Route-based code splitting

---

## 🛠️ Code Quality

### Refactoring
1. **Custom Hooks Cleanup**
   - [ ] useVoting - optimalizovať re-renders
   - [ ] useCommunityBlocks - pridať caching
   
2. **Component Structure**
   - [ ] Rozdeliť veľké komponenty
   - [ ] Pridať React.memo kde potrebné
   
3. **Type Safety**
   - [ ] Lepšie TypeScript typy
   - [ ] Remove any types

### State Management
1. **Zustand Store**
   - [ ] Presunúť globálny state (theme, user)
   - [ ] Cache pre profiles
   
2. **NDK Context**
   - [ ] Lepšie connection handling
   - [ ] Retry logic pre relay disconnects

---

## ⚡ Funkcionálne Vylepšenia

### Must-Have
1. **Pagination/Infinite Scroll**
   - [ ] Nekonečný scroll vo feede
   - [ ] Load more tlačidlo

2. **Optimistic Updates**
   - [ ] Okamžitá odozva pri votovaní
   - [ ] Posting s pending state

3. **Offline Support**
   - [ ] Service Worker
   - [ ] LocalStorage cache
   - [ ] Queue pre offline actions

4. **Real-time Updates**
   - [ ] WebSocket reconnect logic
   - [ ] Live notifications

### Nice-to-Have
1. **Media Support**
   - [ ] Image uploads (Blossom/NostrBuild)
   - [ ] Video embedding
   
2. **Advanced Search**
   - [ ] Full-text search
   - [ ] Filters (by community, date, author)
   
3. **Cross-posting**
   - [ ] Zdieľať do viacerých komunit
   
4. **Polls/Surveys**
   - [ ] NIP-41 alebo custom impl

---

## 🔧 Nostr Protokol Vylepšenia

### Event Kind Standards
1. **Kind 34550 (Communities)** ✓ už máš
2. **Kind 34551 (Community Blocks)** ✓ už máš
3. **Kind 30001 (Communities List)** ✓ už máš
4. **Kind 1985 (Labels)** - pre flagging content
5. **Kind 10000 (Mute List)** - integrovať s blokmi

### NIPs na zváženie
- **NIP-28** - Public chats (alternatíva ku komunitám)
- **NIP-33** - Parameterized replaceable events (pre wiki)
- **NIP-51** - Lists (pre saved posts)
- **NIP-56** - Reporting (pre moderáciu)
- **NIP-65** - Relay List Metadata

---

## 📱 Mobile App (PWA)

### PWA Features
1. **Manifest**
   - [ ] Icons, theme colors
   - [ ] Display mode standalone
   
2. **Service Worker**
   - [ ] Offline caching
   - [ ] Push notifications
   
3. **Native-like Experience**
   - [ ] Pull-to-refresh
   - [ ] Smooth transitions
   - [ ] Haptic feedback

---

## 🧪 Testing

### Unit Tests
- [ ] Test hooks (useVoting, useCommunityBlocks)
- [ ] Test utility funkcie
- [ ] Test NDK integrations

### E2E Tests
- [ ] User flow: login → create post → vote
- [ ] Community flow: create → join → post
- [ ] Moderation flow: block → unblock

---

## 📊 Monitoring & Analytics

1. **Error Tracking**
   - [ ] Sentry alebo LogRocket
   
2. **Performance**
   - [ ] Core Web Vitals
   - [ ] NDK query metrics
   
3. **Usage Analytics**
   - [ ] (Voliteľné) - privacy-first

---

## 📝 Git Workflow

### Commits
```
feat: pridať infinite scroll
fix: opraviť memory leak v useVoting
refactor: extrahovať PostCard komponent
docs: aktualizovať README
```

### Branches
- `main` - produkcia
- `develop` - development
- `feature/mobile-nav` - features
- `fix/memory-leak` - bug fixes

---

## 🎯 Prioritný Poradie

### Týždeň 1: Bezpečnosť & Stabilita
1. Odstrániť hardcoded kľúč
2. Pridať ErrorBoundaries
3. Fix memory leaks
4. Lepšie error handling

### Týždeň 2: Mobile & Performance
1. Mobile-first responzívny dizajn
2. Virtualized lists
3. Image optimization
4. Code splitting

### Týždeň 3: UX Vylepšenia
1. Infinite scroll
2. Optimistic updates
3. Offline support
4. Pull-to-refresh

### Týždeň 4: Polish & Testing
1. PWA features
2. Unit tests
3. Bug fixes
4. Performance audit

---

## 🛠️ Nástroje na Použitie

- **UI:** Tailwind + Headless UI (Radix)
- **Mobile:** Touch events library (react-swipeable)
- **Virtualization:** react-window alebo @tanstack/react-virtual
- **State:** Zustand (máš) + TanStack Query (pre caching)
- **Forms:** React Hook Form + Zod
- **Testing:** Vitest + React Testing Library + Playwright
