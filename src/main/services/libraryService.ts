import type { LibraryStats } from '@shared/types/app'
import { LibraryRepository } from '@main/repositories/libraryRepository'

export class LibraryService {
  constructor(private readonly libraryRepository: LibraryRepository) {}

  getStats(): LibraryStats {
    return this.libraryRepository.getStats()
  }
}
