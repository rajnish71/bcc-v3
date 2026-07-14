// backend/src/modules/gallery/dto/album.dto.ts
//
// DTOs for album creation and update.
// Only MEMBER_CREATED albums can be created via the API; AUTO_EVENT and
// AUTO_CONTEST albums are created by the system.

export interface CreateAlbumDto {
  title:       string;
  description?: string;
  visibility?: 'PUBLIC' | 'MEMBERS_ONLY' | 'PRIVATE';
  kind?:       'COLLECTION' | 'STORY';
}

export interface UpdateAlbumDto {
  title?:        string;
  description?:  string;
  visibility?:   'PUBLIC' | 'MEMBERS_ONLY' | 'PRIVATE';
  kind?:         'COLLECTION' | 'STORY';
  cover_photo_uuid?: string;  // UUID of a photo already in this album
}

export interface AddPhotoToAlbumDto {
  photo_uuid: string;
}
