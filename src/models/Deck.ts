import { Schema, model, models, Types } from "mongoose";

const DeckSchema = new Schema({
  name: { type: String, required: true },
  createdAt: { type: Date, default: () => new Date() },
});

export type DeckDoc = {
  _id: Types.ObjectId;
  name: string;
  createdAt: Date;
};

export default models.Deck || model("Deck", DeckSchema);
