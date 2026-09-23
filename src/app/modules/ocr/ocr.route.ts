import express from 'express';
import auth from '../../middlewares/auth';
import { USER_ROLES } from '../../../enums/user';
import { OCRController } from './ocr.controller';
import { ocrUpload } from '../../../helpers/multer';

const router = express.Router();

router
  .route('/analyze')
  .post(
    auth(USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN, USER_ROLES.USER),
    ocrUpload.single('file'),
    OCRController.analyzeReceipt,
  );

export const OCRRoutes = router;
