# Memoji Sticker Capture in iOS

## The Problem

Apple provides no public API to pick, save, or extract Memoji stickers as images. Memoji are locked inside Apple's ecosystem — they exist as proprietary data formats, not as standard images.

## What We Tried (and Why Each Failed)

### 1. `UIPasteboard.general.image`
User copies a Memoji sticker in Messages → we read `UIPasteboard.general.image`.

**Result:** `nil`. Memoji stickers are placed on the clipboard as attributed strings with embedded attachments, not as `public.image`. The standard image accessor doesn't recognize the format.

### 2. `PasteButton(supportedContentTypes: [.image])`
SwiftUI's system paste button, which bypasses iOS 16+ paste permission prompts.

**Result:** Button stays greyed out. `PasteButton` checks UTTypes on the clipboard, and Memoji sticker data doesn't conform to `public.image` or any standard image UTType.

### 3. `PhotosPicker`
Let the user pick an image from their photo library.

**Result:** Works for any image, but useless for Memoji — there's no "Save to Photos" option when you long-press a Memoji sticker in Messages. Only Copy/Delete/Forward are available.

### 4. `NSTextAttachment` detection in `UITextView`
Place a `UITextView` on screen → user taps a Memoji sticker from the keyboard → it renders in the text view → enumerate `NSTextAttachment` in the attributed text to extract the image.

**Result:** The sticker appears visually, but `attachment.image` and `attachment.fileWrapper?.regularFileContents` are both nil. The system inserts Memoji stickers through a special rendering pipeline, not as standard `NSTextAttachment` image data.

### 5. `layer.render(in: CGContext)`
Render the `UITextView`'s Core Animation layer tree to an image context.

**Result:** Blank/transparent image. Memoji stickers are rendered by the system as special compositor views that sit above the standard layer tree. `CALayer.render(in:)` only captures the layer hierarchy, not these system-composited elements.

## What Actually Works: `drawHierarchy(in:afterScreenUpdates:)`

```swift
textView.drawHierarchy(in: textView.bounds, afterScreenUpdates: true)
```

This captures the **actual screen pixels** of the view, including system-composited content like Memoji stickers. It's essentially a view-level screenshot rather than a layer-level render.

### Why This Works

- `layer.render(in:)` traverses the Core Animation layer tree and draws each layer. System-inserted sticker views are not part of this tree.
- `drawHierarchy(in:afterScreenUpdates:)` asks the render server for the final composited output of the entire view hierarchy — everything the user can see on screen, regardless of how it's internally rendered.

## Architecture

```
┌─────────────────────────────────────────────────┐
│ MemojiStickerSheet                              │
│  ┌───────────────────────────────────────────┐  │
│  │ StickerInputField (UITextView wrapper)    │  │
│  │  - allowsEditingTextAttributes = true     │  │
│  │  - User taps Memoji from keyboard         │  │
│  │  - Sticker renders visually               │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │ "Use This" button                         │  │
│  │  → drawHierarchy captures visible pixels  │  │
│  │  → trimmingTransparentPixels() crops      │  │
│  │  → AvatarManager.save() to App Group      │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ App Group Container (group.com.happytusk.app)   │
│  └── avatars/                                   │
│       └── {categoryType}_{itemName}.png         │
│           Key is name-based (not ID-based)       │
│           so avatars persist across months       │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ Budget Item Ring Widget                         │
│  - Reads avatarKey from BudgetItemRingsData     │
│  - AvatarManager.load(forKey:) from App Group   │
│  - Shows Image(uiImage:) or falls back to emoji │
└─────────────────────────────────────────────────┘
```

## Key Files

| File | Role |
|------|------|
| `Shared/AvatarManager.swift` | Save/load/remove avatar PNGs from App Group. Includes `UIImage.resized(toMaxDimension:)` and `CGImage.trimmingTransparentPixels()`. Both app + widget targets. |
| `Shared/BudgetItemRingsData.swift` | `BudgetItemRingItem.avatarKey: String?` — bridges app and widget. Backward-compatible with `decodeIfPresent`. |
| `Views/Budget/BudgetItemDetail.swift` | Avatar section UI (Memoji button + PhotosPicker + Remove). `MemojiStickerSheet`, `StickerInputField` (UITextView wrapper with `drawHierarchy` capture). |
| `Views/Budget/BudgetView.swift` | Threads `categoryType` through `BudgetActiveSheet.itemDetail` to `BudgetItemDetail`. |
| `ViewModels/BudgetViewModel.swift` | `writeBudgetItemRingsData()` generates avatar keys, checks `AvatarManager.exists()`. |
| `SpendingPaceWidget/SmallWidgetsViews.swift` | `BudgetItemRingSmallEntryView` loads avatar via `AvatarManager.load(forKey:)`, renders `Image(uiImage:)` in ring center. |

## Transparent Pixel Trimming

The `drawHierarchy` capture includes the full `UITextView` bounds (mostly transparent). `CGImage.trimmingTransparentPixels()` scans all pixels, finds the bounding box of non-transparent content, and crops to just the sticker. This produces a clean PNG that looks good clipped to a circle in the widget.

## Avatar Key Strategy

Budget item IDs are per-month (Groceries in March ≠ Groceries in February). Avatar keys use `{categoryType}_{itemName}` (lowercased, underscored) so the same avatar persists across months automatically. Trade-off: renaming a budget item breaks the link, but that's acceptable since setting an avatar is a manual action anyway.
