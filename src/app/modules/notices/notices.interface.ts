export type TNoticeType = 'IRS Notice' | 'Case Status';

export type INotice = {
  type: TNoticeType;
  document: string;
  documentKey?: string;
};
