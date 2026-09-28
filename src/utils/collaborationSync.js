export const saveSnapshotIsCurrent = ({
  scheduledGeneration,
  currentGeneration,
  scheduledRevision,
  currentRevision,
}) => (
  scheduledGeneration === currentGeneration
  && scheduledRevision === currentRevision
);

export const shouldReplaceRemoteDocument = (incomingRevision, currentRevision) => (
  incomingRevision === null
  || incomingRevision === undefined
  || currentRevision === null
  || currentRevision === undefined
  || Number(incomingRevision) > Number(currentRevision)
);

export const documentsMatch = (left, right) => JSON.stringify({
  nodes: left?.nodes || [], edges: left?.edges || [],
}) === JSON.stringify({
  nodes: right?.nodes || [], edges: right?.edges || [],
});

export const isOwnSocketEvent = (event, localDocument, knownRequestIds) => (
  Boolean(event?.origin_request_id && knownRequestIds?.has(event.origin_request_id))
  || documentsMatch(event, localDocument)
);
