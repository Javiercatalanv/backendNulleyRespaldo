import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApiSnapshot, ApiSnapshotDocument } from './schemas/api-snapshot.schema';

@Injectable()
export class ApiSnapshotsService {
  constructor(
    @InjectModel(ApiSnapshot.name)
    private readonly apiSnapshotModel: Model<ApiSnapshotDocument>,
  ) {}

  saveSuccess(params: {
    platform: string;
    externalId: string;
    researcherProfileId: string | null;
    rawResponse: any[];
    entryCount: number;
  }): Promise<ApiSnapshotDocument> {
    return this.apiSnapshotModel.create({
      ...params,
      status: 'success',
      errorMessage: null,
    });
  }

  saveError(params: {
    platform: string;
    externalId: string;
    researcherProfileId: string | null;
    errorMessage: string;
  }): Promise<ApiSnapshotDocument> {
    return this.apiSnapshotModel.create({
      ...params,
      rawResponse: [],
      entryCount: 0,
      status: 'error',
    });
  }

  findLatest(
    platform: string,
    externalId: string,
  ): Promise<ApiSnapshotDocument | null> {
    return this.apiSnapshotModel
      .findOne({ platform, externalId, status: 'success' })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findSuccessfulByPlatform(
    platform: string,
  ): Promise<ApiSnapshotDocument[]> {
    const latestIds = await this.apiSnapshotModel.aggregate<{ _id: any }>([
      { $match: { platform, status: 'success' } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$externalId',
          docId: { $first: '$_id' },
        },
      },
      { $project: { _id: '$docId' } },
    ]);

    return this.apiSnapshotModel
      .find({ _id: { $in: latestIds.map((x) => x._id) } })
      .exec();
  }

  list(limit = 50, skip = 0): Promise<ApiSnapshotDocument[]> {
    return this.apiSnapshotModel
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-rawResponse')
      .exec();
  }

  findById(id: string): Promise<ApiSnapshotDocument | null> {
    return this.apiSnapshotModel.findById(id).exec();
  }
}
