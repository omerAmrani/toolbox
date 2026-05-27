import { Injectable } from '@nestjs/common';
import {
  createClass, getClasses, getClass, updateClassMeta, deleteClass,
  createLecture, getLectures, getLecture, updateLectureMeta, deleteLecture,
  lectureDirPath,
  saveSummaryVersion, getSummaryVersions, getSummaryContent,
  getCurrentSummaryContent, setCurrentSummary, deleteSummaryVersion,
  reloadFromDisk,
  CLASSES_DIR,
} from '../../storage';

@Injectable()
export class StorageService {
  readonly createClass = createClass;
  readonly getClasses = getClasses;
  readonly getClass = getClass;
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
  readonly setCurrentSummary = setCurrentSummary;
  readonly deleteSummaryVersion = deleteSummaryVersion;
  readonly reloadFromDisk = reloadFromDisk;
  readonly CLASSES_DIR = CLASSES_DIR;
}
