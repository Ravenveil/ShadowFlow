/**
 * 图标层 — 全部走 lucide-react（官方图标库），不再手绘 SVG。
 *
 * 保留原来的 `Icon*` 导出名，等于「换实现不换接口」：所有调用方一行都不用改。
 * 统一 1.7px 描边、16px 默认尺寸，和正文的字重对得上；某个地方想更粗/更细，
 * 直接传 size，不要另起一套 svg。
 */
import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Clock,
  Code2,
  Database,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Folder,
  GitBranch,
  Image as ImageIcon,
  KeyRound,
  Keyboard,
  Layers,
  LayoutGrid,
  Link as LinkIcon,
  Loader2,
  Menu,
  MessageSquare,
  MessageSquareText,
  Mic,
  MoreHorizontal,
  MousePointer2,
  Network,
  Palette,
  PanelRight,
  Paperclip,
  PenLine,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings as SettingsIcon,
  Shield,
  Slash,
  SlidersHorizontal,
  Sparkles,
  Square,
  Target,
  Terminal,
  Trash2,
  User,
  Users,
  UsersRound,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

type P = { size?: number; className?: string };

/** 统一描边与默认尺寸；调用方只管给 size。 */
export const STROKE = 1.7;

function mk(I: LucideIcon) {
  return function Icon({ size = 16, className }: P) {
    return <I size={size} strokeWidth={STROKE} className={className} aria-hidden="true" />;
  };
}

/* 导航 / 外壳 */
export const IconPlus = mk(Plus);
export const IconChat = mk(MessageSquare);
export const IconFolder = mk(Folder);
export const IconUsers = mk(Users);
export const IconUser = mk(User);
export const IconBook = mk(BookOpen);
export const IconClock = mk(Clock);
export const IconSearch = mk(Search);
export const IconSettings = mk(SettingsIcon);
export const IconPanel = mk(PanelRight);
export const IconGrid = mk(LayoutGrid);
export const IconLayers = mk(Layers);
export const IconBell = mk(Bell);
export const IconShield = mk(Shield);
export const IconBrain = mk(Brain);
export const IconSliders = mk(SlidersHorizontal);
export const IconPalette = mk(Palette);
export const IconKey = mk(KeyRound);
export const IconTerminal = mk(Terminal);
export const IconPlug = mk(Plug);
export const IconServer = mk(Server);
export const IconPen = mk(PenLine);

/* 方向 / 状态 */
export const IconChevron = mk(ChevronRight);
export const IconChevronDown = mk(ChevronDown);
export const IconArrowRight = mk(ArrowRight);
export const IconArrowUp = mk(ArrowUp);
export const IconCheck = mk(Check);
export const IconCheckCircle = mk(CheckCircle2);
export const IconCircleDashed = mk(CircleDashed);
export const IconAlert = mk(AlertCircle);
export const IconLoader = mk(Loader2);
export const IconMore = mk(MoreHorizontal);
export const IconClose = mk(X);
export const IconRefresh = mk(RefreshCw);

/* 聊天 / 输入框 */
export const IconSparkle = mk(Sparkles);
export const IconPaperclip = mk(Paperclip);
export const IconSlash = mk(Slash);
export const IconFile = mk(FileText);
export const IconImage = mk(ImageIcon);
export const IconCode = mk(Code2);
export const IconBranch = mk(GitBranch);
export const IconPlay = mk(Play);
export const IconStop = mk(Square);
export const IconMic = mk(Mic);
export const IconLink = mk(LinkIcon);
export const IconKeyboard = mk(Keyboard);

/* 数据 / 动作 */
export const IconDownload = mk(Download);
export const IconEye = mk(Eye);
export const IconTrash = mk(Trash2);

/* 落地页专用 */
export const IconBarChart = mk(BarChart3);
export const IconBrainCircuit = mk(BrainCircuit);
export const IconNetwork = mk(Network);
export const IconDatabase = mk(Database);
export const IconFileCheck = mk(FileCheck2);
export const IconTarget = mk(Target);
export const IconUsersRound = mk(UsersRound);
export const IconZap = mk(Zap);
export const IconPointer = mk(MousePointer2);
export const IconMenu = mk(Menu);
export const IconMessage = mk(MessageSquareText);
