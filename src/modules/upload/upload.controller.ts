import {BadRequestException,Controller,Post,Query,UploadedFile,UseInterceptors,} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExcelService } from '../excel/excel.service';
import { JcrImportService } from '../jcr-resolver/jcr-import.service';
import { PublicationDetailsService } from '../publication-details/publication-details.service';

@Controller('upload')
export class UploadController {
  private static readonly ACCEPTED_MIMETYPES = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'application/octet-stream', // genérico
  ];

  private static readonly ACCEPTED_JSON_MIMETYPES = [
    'application/json',
    'text/json',
    'application/octet-stream',
  ];

  constructor(
    private readonly excelService: ExcelService,
    private readonly jcrImportService: JcrImportService,
    private readonly publicationDetailsService: PublicationDetailsService,
  ) {}

  /** POST /upload/excel — multipart/form-data con campo "file". */
  @Post('excel')
  @UseInterceptors(FileInterceptor('file'))
  async uploadExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file received under field "file"');
    }
    const isAcceptedMime = UploadController.ACCEPTED_MIMETYPES.includes(file.mimetype);
    const hasExcelExtension = /\.(xlsx|xls)$/i.test(file.originalname);
    if (!isAcceptedMime || !hasExcelExtension) {
      throw new BadRequestException(
        `Unsupported file: ${file.originalname} (${file.mimetype}). Expected an Excel file (.xlsx or .xls).`,
      );
    }
    return this.excelService.importFromBuffer(file.buffer, file.originalname);
  }

  /**
   * POST /upload/jcr?year=2025 — multipart/form-data con campo "file" (JSON).
   * Sube el listado anual de factores de impacto/cuartiles del JCR.
   * Tras guardarlo, re-aplica las métricas a todas las publicaciones existentes.
   */
  @Post('jcr')
  @UseInterceptors(FileInterceptor('file'))
  async uploadJcr(
    @UploadedFile() file: Express.Multer.File,
    @Query('year') year?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file received under field "file"');
    }
    const isAcceptedMime = UploadController.ACCEPTED_JSON_MIMETYPES.includes(file.mimetype);
    const hasJsonExtension = /\.json$/i.test(file.originalname);
    if (!isAcceptedMime || !hasJsonExtension) {
      throw new BadRequestException(
        `Unsupported file: ${file.originalname} (${file.mimetype}). Expected a .json file.`,
      );
    }

    const jcrYear = year ? parseInt(year, 10) : new Date().getFullYear();
    if (!Number.isInteger(jcrYear) || jcrYear < 1990 || jcrYear > 2100) {
      throw new BadRequestException(`Invalid year: ${year}`);
    }

    const importResult = await this.jcrImportService.importFromBuffer(file.buffer, jcrYear);

    // Re-aplicar JIF/cuartil a las publicaciones ya existentes en la base
    const reapply = await this.publicationDetailsService.reapplyMetrics();

    return { ...importResult, reapply };
  }
}
