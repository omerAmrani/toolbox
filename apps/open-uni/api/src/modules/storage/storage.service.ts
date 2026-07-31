import { Injectable } from '@nestjs/common';
import {
  createClass, getClasses, getClass, getClassForUser, updateClassMeta, deleteClass,
  createLecture, getLectures, getLecture, updateLectureMeta, deleteLecture,
  lectureDirPath,
  saveSummaryVersion, getSummaryVersions, getSummaryContent,
  getCurrentSummaryContent, deleteSummaryVersion,
  reloadFromDisk,
  getNotifyEmail, setNotifyEmail,
  getActiveSemester, setActiveSemester,
  getUserByEmail, createUser, getOrCreateUser,
  createMagicLinkToken, consumeMagicLinkToken,
  CLASSES_DIR,
} from '../../storage';
export type { ActiveSemester, User } from '../../storage';

@Injectable()
export class StorageService {
  readonly createClass = createClass;
  readonly getClasses = getClasses;
  readonly getClass = getClass;
  readonly getClassForUser = getClassForUser;
  readonly updateClassMeta = updateClassMeta;
  readonly deleteClass = deleteClass;
  readonly createLecture = createLecture;
  readonly getLectures = getLectures;
  readonly getLecture = getLecture;
  readonly updateLectureMeta = updateLectureMeta;
  readonly deleteLecture = deleteLecture;
  readonly lectureDirPath = lectureDirPath;
  readonly saveSummaryVersion = saveSummaryVersion;
  readonly getSummaryVersions = getSummaryVersions;
  readonly getSummaryContent = getSummaryContent;
  readonly getCurrentSummaryContent = getCurrentSummaryContent;
  readonly deleteSummaryVersion = deleteSummaryVersion;
  readonly reloadFromDisk = reloadFromDisk;
  readonly getNotifyEmail = getNotifyEmail;
  readonly setNotifyEmail = setNotifyEmail;
  readonly getActiveSemester = getActiveSemester;
  readonly setActiveSemester = setActiveSemester;
  readonly getUserByEmail = getUserByEmail;
  readonly createUser = createUser;
  readonly getOrCreateUser = getOrCreateUser;
  readonly createMagicLinkToken = createMagicLinkToken;
  readonly consumeMagicLinkToken = consumeMagicLinkToken;
  readonly CLASSES_DIR = CLASSES_DIR;
}
