/** 设置分区的公共 props：数据 + 一个「改一块」的函数，别的一概不知道。 */
import type { AppSettings } from '../data/types';

export interface SectionProps {
  settings: AppSettings;
  onPatch: (patch: Partial<AppSettings>) => void;
}
