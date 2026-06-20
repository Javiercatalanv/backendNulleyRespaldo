import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ImportRecord,
  ImportRecordDocument,
} from './schemas/import-record.schema';

@Injectable()
export class ImportsService {
  constructor(
    @InjectModel(ImportRecord.name)
    private readonly importModel: Model<ImportRecordDocument>,
  ) {}

  create(payload: Partial<ImportRecord>): Promise<ImportRecordDocument> {
    return this.importModel.create(payload);
  }

  findRecent(limit = 20): Promise<ImportRecordDocument[]> {
    return this.importModel.find().sort({ createdAt: -1 }).limit(limit).exec();
  }

  findById(id: string): Promise<ImportRecordDocument | null> {
    return this.importModel.findById(id).exec();
  }
}
