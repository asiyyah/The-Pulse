# The Pulse App Explained for a 7-Year-Old

Imagine you have a special magic box that shows you pictures of your favorite creators. Let me explain how it works in a way that's super easy to understand!

---

## The Magic Box (The App)

Our app is like a **magic box** that:

- Shows you pictures of creators
- Lets you press a button to follow them
- Remembers information so it doesn't ask for the same thing twice

---

## Query Keys: Name Tags for Information

Think of a **query key** like a **name tag** on a toy box.

Let's say you have toy boxes:

- One box is labeled `['creators']` — it holds all the creator pictures
- Another is labeled `['creator', 'bob']` — it holds just Bob's picture

### Why Name Tags Matter

```typescript
export const CREATORS_KEY = ["creators"] as const;
```

This is like writing `['creators']` on a name tag. When you want the list of all creators, you say "Hey magic box, give me the box labeled `['creators']`!"

The computer uses this name tag to:

- Find the right information quickly
- Know when to update information
- Keep track of which information is which

**Analogy:** It's like having name tags on toy boxes so you never mix them up. You always know which box has what!

---

## Stale Time vs Cache Time: Fresh Juice 🧃

Imagine your mom makes fresh orange juice:

### Stale Time (Fresh Time)

**Setting: `staleTime: 30_000` — 30 seconds**

This means: "This juice tastes **fresh** for 30 seconds. If you drink it within 30 seconds, it's still yummy!"

```typescript
staleTime: 30_000; // 30 seconds = fresh juice
```

During these 30 seconds:

- If you ask for the creators list again, the app says "I already have it! It's still fresh!"
- The app doesn't ask the server again
- It just shows you what's already in memory

**Why?** Because the information probably hasn't changed, so why ask again?

### Cache Time (Fridge Time)

**Setting: `gcTime: 5 * 60 * 1000` — 5 minutes**

This means: "Keep the juice in the fridge for 5 minutes in case you want it again. After 5 minutes, throw it away."

```typescript
gcTime: 5 * 60 * 1000; // 5 minutes = keep in fridge
```

During these 5 minutes:

- Even if the juice is "stale" (older than 30 seconds)
- The app still remembers it and keeps it ready
- If you ask again, it's super fast because it's already there

**After 5 minutes:**

- The app throws away the old information
- Next time you need it, it has to ask the server again

### The Timeline

```
T0 seconds:  Get creators list → Store it (Fresh!)
T10 seconds: Ask for list again → Use the fresh one in memory (no network!)
T30 seconds: Ask for list again → It's STALE now, but still in fridge, so fetch fresh one
T40 seconds: Still in fridge, still fresh (from T30 fetch)
T5 minutes:  Time to throw away the old juice!
```

**Analogy:**

- **Stale Time** = How long before juice loses its "fresh" taste
- **Cache Time** = How long before juice gets thrown away from the fridge

---

## Mutations: Making Changes

A **mutation** is like changing something.

In our app, a mutation happens when you click the **Follow button**.

### The Flow

```typescript
export function useFollowCreator() {
  return useMutation({
    mutationFn: followCreator, // The action: follow someone
    onMutate: async (creatorId) => {
      /* Before network */
    },
    onError: () => {
      /* If it fails */
    },
    onSettled: () => {
      /* When done */
    },
  });
}
```

**Think of it like a magic trick:**

1. **You perform the trick (Optimistic Update)**
2. **People watch to see if it works (Network Request)**
3. **If it works, great! (Success)**
4. **If it fails, you undo the trick (Rollback)**

---

## The Magic Trick: Optimistic Updates

When you click **Follow**, here's what happens:

### Step 1: You Perform the Trick BEFORE the Audience Sees It (onMutate)

```typescript
onMutate: async (creatorId: string) => {
  // Cancel other requests
  await queryClient.cancelQueries({ queryKey: CREATORS_KEY });

  // Save the old list (just in case!)
  const previousCreators = queryClient.getQueryData<Creator[]>(CREATORS_KEY);

  // Change the list RIGHT NOW
  queryClient.setQueryData<Creator[]>(CREATORS_KEY, (old) => {
    return old.map((creator) => {
      if (creator.id === creatorId) {
        return {
          ...creator,
          isFollowing: !creator.isFollowing, // Toggle it!
          followers: creator.isFollowing
            ? creator.followers - 1 // Went down
            : creator.followers + 1, // Went up
        };
      }
      return creator;
    });
  });

  return { previousCreators }; // Remember the old one!
};
```

**What's happening:**

1. **Save the old state:** Imagine you have a photo of the creators list BEFORE you pressed follow. We keep this photo safe.

   ```typescript
   const previousCreators = queryClient.getQueryData(CREATORS_KEY);
   ```

2. **Update immediately:** Change the list RIGHT NOW on your screen. The button shows "Following..." instantly!

   ```typescript
   queryClient.setQueryData(CREATORS_KEY, (old) => {
     /* change it */
   });
   ```

3. **The magic:** The user SEES the change happen instantly, even though we haven't asked the server yet!

**Analogy:** It's like pulling a tablecloth away from under dishes. You do the trick, and the dishes stay in place. But you're holding the old tablecloth just in case you messed up!

---

## How the Rollback Works: Undoing the Magic Trick

If something goes wrong (the server says "no"), we have a secret move: **undo the trick!**

### Step 2B: The Trick Failed! (onError)

```typescript
onError: (_error, _creatorId, context) => {
  if (context?.previousCreators) {
    // Put the old list back!
    queryClient.setQueryData<Creator[]>(CREATORS_KEY, context.previousCreators);
  }
};
```

**What happens:**

1. The server says "Something went wrong! Error 500!"
2. We catch that error
3. We put the old photo back
4. The button goes back to "Follow" (not "Following")
5. The followers count goes back to what it was

**Why?** Because we **saved the old state** before we made the change!

**Analogy:** You pulled the tablecloth, but the dishes fell! Quickly, you had a duplicate dish set ready, so you swap it back. Now it looks like nothing happened!

---

## The Complete Magic Trick Timeline

### Scenario: You Follow Someone Named "Sarah"

```
BEFORE:
- Button says: "Follow"
- Sarah has 100 followers
- Local list in memory: [sarah: 100, following: false]
```

### T0 milliseconds: You click the button

```typescript
handleFollow() → followMutation.mutate('sarah')
```

### T0ms: onMutate Runs

```
SAVE:
previousCreators = [sarah: 100, following: false]  ← Keep this!

UPDATE:
[sarah: 101, following: true]  ← Show THIS now!

BUTTON SHOWS: "Following..."
UI SHOWS: Sarah now has 101 followers
```

**You see the change INSTANTLY!**

### T0-50ms: Network request goes to the server

```
Browser → POST /api/follow/sarah
```

### T50ms: Server receives the request

### T1050ms: Server responds

**Success Case:**

```
Server says: "Yes! Sarah now has 101 followers!"
Response: { isFollowing: true, followers: 101 }
```

**Error Case (20% chance):**

```
Server says: "ERROR! Something went wrong!"
Response: { status: 500, error: "Network error" }
```

### T1050ms: onError (only if it failed)

If the server said NO:

```typescript
onError: () => {
  // Restore!
  [sarah: 100, following: false]  ← Put it back!
  BUTTON SHOWS: "Follow"
  UI SHOWS: Sarah has 100 followers again
}
```

**It's like nothing happened!**

### T1050ms: onSettled (happens either way)

Whether it worked or failed:

```typescript
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: CREATORS_KEY });
  // "Hey server, is everything still fresh? Send me the newest list!"
};
```

This tells the app to ask the server for a fresh, up-to-date list.

### T1100ms: Server sends fresh list

The server says: "Here's the newest information!"

### T1100ms: Screen updates with the real truth

The UI shows the real state from the server.

---

## Why Is This Magic Trick So Awesome?

### Without the Trick (Old Way)

```
T0ms:     You click Follow
T0ms:     Button freezes, shows loading spinner
T1050ms:  Server responds
T1050ms:  Button updates
Total wait: 1 full second of staring at a spinner! 😴
```

### With the Trick (Our Way)

```
T0ms:     You click Follow
T0ms:     Button updates IMMEDIATELY to "Following..."
T1050ms:  Server responds (you might not even notice the wait!)
T1050ms:  Button confirms the server agrees
Total wait: Feels instant! 🚀
```

**The magic:** The user **feels** like it's instant, even though the network takes 1 second!

---

## The Complete Picture

```
┌─────────────────────────────────────────────────────────┐
│  You Click Follow Button                                │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │  onMutate Runs (Immediately) │
        │  Save old state              │
        │  Update cache RIGHT NOW      │
        │  Show "Following..." button  │
        │  User sees change instantly! │
        └────────────┬─────────────────┘
                     │
                     ▼
        ┌──────────────────────────────┐
        │  Network Request to Server   │
        │  (Takes ~1 second)           │
        └────────────┬─────────────────┘
                     │
           ┌─────────┴────────┐
           │                  │
           ▼                  ▼
        SUCCESS            ERROR
           │                  │
           │                  ▼
           │      ┌──────────────────────────┐
           │      │  onError Runs            │
           │      │  Restore old state       │
           │      │  Undo the change         │
           │      │  Show "Follow" button    │
           │      └──────────────────────────┘
           │
           ▼
    ┌──────────────────────────────┐
    │  onSettled Runs (Either Way) │
    │  Invalidate cache            │
    │  Ask server for fresh data   │
    └──────────────────────────────┘
           │
           ▼
    ┌──────────────────────────────┐
    │  Server sends new data       │
    │  Cache updates with truth    │
    │  Screen shows real state     │
    └──────────────────────────────┘
```

---

## Summary: The Three Magic Moves

### 1. Query Keys 🏷️

**Name tags for information.** `['creators']` = all creators, `['creator', 'bob']` = just Bob.

### 2. Stale vs Cache Time ⏰

- **Stale Time (30 seconds)** = Fresh juice. Still good, don't ask the server again.
- **Cache Time (5 minutes)** = Keep juice in fridge. After this, throw it away.

### 3. Mutation Magic ✨

- **onMutate:** Do the trick before the audience sees it (update UI immediately)
- **onError:** Undo the trick if it fails (restore old state)
- **onSettled:** Confirm with the server (ask for fresh data)

### 4. Rollback 🔄

**The safety net!** We save a photo of the old state before making changes. If something fails, we just put the photo back!

---

## The Big Idea

The app uses a **magic trick** to make following creators feel **instant**, even though the network takes time. It:

1. Shows the change immediately (optimistic update)
2. Asks the server to confirm
3. If the server says no, it **secretly undoes the change** so you never notice!

It's like a magician who has a backup plan in case the trick fails—the audience never knows! 🎩✨
