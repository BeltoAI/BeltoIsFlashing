import mongoose, { Schema, models, model } from "mongoose";

const CardSchema = new Schema({
  deckId: { type: Schema.Types.ObjectId, ref: "Deck", index: true, required: true },
  q:      { type: String, required: true },
  a:      { type: String, required: true },
  ease:   { type: Number, default: 2.5 },
  interval:{ type: Number, default: 0 },
  due:    { type: Date,   default: () => new Date() },
  createdAt:{ type: Date, default: () => new Date() },
}, { versionKey: false });

export default models.Card || model("Card", CardSchema);
