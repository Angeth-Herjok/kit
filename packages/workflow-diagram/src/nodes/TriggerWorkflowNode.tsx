import React, { memo } from 'react';

import { Handle, Position } from 'react-flow-renderer';
import type { NodeProps } from 'react-flow-renderer';
import cronstrue from 'cronstrue';

function updateData(data: any): any {
  switch (data.label) {
    case 'Webhook':
      data.description = `When data is received at ${data.webhookUrl}`;
      break;
    case 'Cron':
      data.description = cronstrue.toString(data.cronExpression);
      break;
    default:
      break;
  }
  data.workflow.name = data.workflow.name ?? 'Untitled';
  return data;
}

const TriggerWorkflowNode = ({
  data,
  isConnectable,
  sourcePosition = Position.Bottom,
}: NodeProps) => {
  const updatedData = updateData(data);
  return (
    <div
      className="bg-white cursor-pointer h-full py-1 px-1 rounded-md shadow-sm
        text-center text-xs ring-0.5 ring-black ring-opacity-5"
    >
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p>{updatedData?.workflow?.name}</p>
        <p
          title={updatedData?.description}
          className="text-[0.6rem] italic text-ellipsis overflow-hidden whitespace-pre-line"
        >
          {updatedData?.description}
        </p>
      </div>
      <Handle
        type="source"
        position={sourcePosition}
        isConnectable={isConnectable}
        style={{ border: 'none', height: 0, top: 0 }}
      />
    </div>
  );
};

TriggerWorkflowNode.displayName = 'TriggerWorkflowNode';

export default memo(TriggerWorkflowNode);
