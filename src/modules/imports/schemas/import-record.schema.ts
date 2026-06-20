import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ImportRecordDocument = HydratedDocument<ImportRecord>;

@Schema({ collection: 'import_records', timestamps: true })
export class ImportRecord {
  @Prop({ required: true })
  originalFileName: string;

  @Prop({ required: true })
  sheetName: string;

  @Prop({ type: Array, default: [] })
  rawRows: Record<string, unknown>[];

  @Prop({
    type: {
      researchersCreated: { type: Number, default: 0 },
      researchersUpdated: { type: Number, default: 0 },
      profilesCreated: { type: Number, default: 0 },
      publicationsUpserted: { type: Number, default: 0 },
    },
    default: () => ({}),
  })
  summary: {
    researchersCreated: number;
    researchersUpdated: number;
    profilesCreated: number;
    publicationsUpserted: number;
  };

  @Prop({ enum: ['success', 'partial', 'failed'], default: 'success' })
  status: 'success' | 'partial' | 'failed';

  @Prop({ type: [String], default: [] })
  errorMessages: string[];
}

export const ImportRecordSchema = SchemaFactory.createForClass(ImportRecord);
