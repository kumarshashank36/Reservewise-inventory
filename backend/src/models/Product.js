import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, trim: true, uppercase: true, immutable: true, unique: true, maxlength: 64 },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    priceCents: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    onHand: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    reserved: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true, versionKey: false }
);

productSchema.index({ isActive: 1, name: 1 });

productSchema.virtual('available').get(function getAvailable() {
  return this.onHand - this.reserved;
});
productSchema.set('toJSON', { virtuals: true });

export const Product = mongoose.model('Product', productSchema);
