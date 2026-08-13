import mongoose from 'mongoose';

const reservationItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    priceCents: { type: Number, required: true, min: 0, validate: Number.isSafeInteger }
  },
  { _id: false }
);

const reservationSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['pending', 'completed', 'cancelled', 'expired'], default: 'pending', index: true },
    items: { type: [reservationItemSchema], required: true, validate: [(items) => items.length > 0, 'A reservation needs one or more items'] },
    idempotencyKey: { type: String, required: true, maxlength: 128 },
    expiresAt: { type: Date, required: true, index: true },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    expiredAt: { type: Date, default: null }
  },
  { timestamps: true, versionKey: false }
);

reservationSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true });
reservationSchema.index({ customerId: 1, createdAt: -1 });
reservationSchema.index({ status: 1, expiresAt: 1 });
reservationSchema.index({ 'items.productId': 1 });

export const Reservation = mongoose.model('Reservation', reservationSchema);
