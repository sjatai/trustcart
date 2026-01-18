export type SunnyStepRawProduct = {
  url: string;
  name: string;
  brand: string;
  sku: string;
  price: string;
  priceCurrency: string;
  availability?: string;
  description?: string;
  images: string[];
  sourceImageUrls?: string[];
};

export type SunnyStepProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  sku: string;
  price: number;
  priceCurrency: string;
  description: string;
  images: string[];
  sourceUrl: string;
  isVariant?: boolean;
  variantOf?: string;
};

export type SunnyStepRawBlogMeta = {
  url: string;
  headline: string;
  description: string;
  datePublished: string | null;
  image: string;
  sourceImageUrl?: string;
  detectedBy?: string;
};

export type SunnyStepBlogPost = {
  id: string;
  slug: string;
  headline: string;
  description: string;
  datePublished: string | null;
  image: string;
  sourceUrl: string;
};

export type SunnyStepFaqDoc = {
  source: string;
  items: Array<{
    question: string;
    answer: string;
    sourceUrl: string;
    derived?: boolean;
  }>;
};

