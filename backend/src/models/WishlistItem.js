import mongoose from 'mongoose';

const wishlistItemSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true }
  },
  { timestamps: true, versionKey: false }
);

// A product can appear at most once per customer; the unique index also makes
// concurrent double-adds race-resolvable in the service.
wishlistItemSchema.index({ customerId: 1, productId: 1 }, { unique: true });
// Supports the customer wishlist list query (sort by added date).
wishlistItemSchema.index({ customerId: 1, createdAt: -1 });

export const WishlistItem = mongoose.model('WishlistItem', wishlistItemSchema);
