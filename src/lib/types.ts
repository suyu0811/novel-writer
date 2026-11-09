export interface Chapter {
  id: string
  title: string
  /** 章节正文，Markdown 字符串 */
  content: string
}

export interface Volume {
  id: string
  title: string
  chapters: Chapter[]
  isSetting?: boolean // ★ 新增：是否为设定集卷
}

export interface Book {
  /** 书籍所在目录 */
  dir: string
  /** 书稿文件（dir/book.md） */
  file: string
  title: string
  author: string
  volumes: Volume[]
}

/** 书库里的一本书（只放列表需要的信息） */
export interface BookMeta {
  dir: string
  title: string
  author: string
  kind: 'book'
}

export interface ArchiveItem {
  name: string
  path: string
  kind: 'auto' | 'manual'
  stamp: string
}

export type ExportKind = 'md' | 'txt' | 'zip'
