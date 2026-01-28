import { Injectable } from '@nestjs/common';
import { CreateResumeDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Resume, ResumeDocument } from './entities/resume.entity';
import { Model, Types } from 'mongoose';

@Injectable()
export class ResumeService {
  constructor(
    @InjectModel(Resume.name) private resumeModel: Model<ResumeDocument>,
  ) {}
  async create(userId: string) {
    return await this.resumeModel.create({
      userId,
      user: new Types.ObjectId(userId),
    });
  }

  findAll() {
    return `This action returns all resume`;
  }

  async findOne(id: string, userId: string) {
    const resume = await this.resumeModel.findOne({
      _id: id,
      userId,
    });
    if (!resume) {
      throw new Error('简历不存在');
    }
    return resume;
  }

  async update(id: string, updateResumeDto: UpdateResumeDto, userId: string) {
    const resume = await this.resumeModel.findOne({
      _id: id,
      userId,
    });
    if (!resume) {
      throw new Error('简历不存在');
    }

    return await this.resumeModel.findByIdAndUpdate(
      id,
      {
        ...updateResumeDto,
        updatedAt: new Date(),
      },
      {
        new: true,
      },
    );
  }

  remove(id: number) {
    return `This action removes a #${id} resume`;
  }
}
