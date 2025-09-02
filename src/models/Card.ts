import { Schema, model, models, Types } from "mongoose";

const CardSchema = new Schema({
  deckId: { type: Schema.Types.ObjectId, ref: "Deck", required: true, index: true },
  question: { type: String, required: true },
  answer: { type: String, required: true },
  box: { type: Number, default: 1 },
  nextReview: { type: Date, default: () => new Date() },
  createdAt: { type: Date, default: () => new Date() },
});

export type CardDoc = {
  _id: Types.ObjectId;
  deckId: Types.ObjectId;
  question: string;
  answer: string;
  box: number;
  nextReview: Date;
  createdAt: Date;
};

export default models.Card || model("Card", CardSchema);
