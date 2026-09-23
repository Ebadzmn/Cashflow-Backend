import { Model } from 'mongoose';

export type ITermsAndConditions = {
  title: string;
  description: string;
};

export type TermsAndConditionsModel = Model<ITermsAndConditions>;
