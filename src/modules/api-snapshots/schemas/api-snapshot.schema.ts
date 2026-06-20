import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ApiSnapshotDocument = HydratedDocument<ApiSnapshot>;

@Schema({ collection: 'api_snapshots', timestamps: { createdAt: true, updatedAt: false } })
export class ApiSnapshot {
  @Prop({ type: String, required: true, index: true })
  platform: string;

  @Prop({ type: String, required: true, index: true })
  externalId: string;

  @Prop({ type: String, required: false, default: null })
  researcherProfileId: string | null;

  @Prop({ type: [Object], default: [] })
  rawResponse: any[];

  @Prop({ type: Number, default: 0 })
  entryCount: number;

  @Prop({ type: String, enum: ['success', 'error'], default: 'success' })
  status: 'success' | 'error';

  @Prop({ type: String, default: null })
  errorMessage: string | null;
}

export const ApiSnapshotSchema = SchemaFactory.createForClass(ApiSnapshot);

ApiSnapshotSchema.index({ platform: 1, externalId: 1, createdAt: -1 });