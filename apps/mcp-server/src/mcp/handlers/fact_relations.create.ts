import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { FactRelation, Fact, TeamMember } from "@knowledgeplane/db";

export const factRelationsCreateTool: Tool = {
  name: "fact_relations.create",
  description:
    "Create a relation between two facts. Relations are typed edges in the knowledge graph.",
  inputSchema: {
    type: "object",
    properties: {
      from_fact: {
        type: "string",
        description: "Source fact ID",
      },
      to_fact: {
        type: "string",
        description: "Target fact ID",
      },
      type: {
        type: "string",
        description:
          "Relation type (e.g., 'references', 'depends_on', 'related_to', 'part_of')",
      },
      metadata: {
        type: "object",
        description: "Additional relation metadata",
        additionalProperties: true,
      },
      created_by: {
        type: "string",
        description:
          "User ID of the creator (optional, inferred from session if authenticated)",
      },
      team_id: {
        type: "string",
        description: "Team ID (optional, inferred from session if authenticated)",
      },
    },
    required: ["from_fact", "to_fact", "type"],
  },
};

export async function handleFactRelationsCreate(args: {
  from_fact: string;
  to_fact: string;
  type: string;
  metadata?: Record<string, any>;
  created_by?: string;
  team_id?: string;
}) {
  // Validate that user ID is provided
  if (!args.created_by) {
    throw new Error(
      "User ID is required. Either provide created_by, or authenticate via session.",
    );
  }

  // Get both facts to validate they belong to the same team
  const fromFact = await Fact.findById(args.from_fact);
  const toFact = await Fact.findById(args.to_fact);

  if (!fromFact) {
    throw new Error(`Source fact with id ${args.from_fact} not found`);
  }
  if (!toFact) {
    throw new Error(`Target fact with id ${args.to_fact} not found`);
  }

  // Validate that both facts belong to the same team
  if (fromFact.team_id !== toFact.team_id) {
    throw new Error("Both facts must belong to the same team");
  }

  const factTeamId = fromFact.team_id;

  // Validate team_id if provided
  if (args.team_id) {
    if (factTeamId !== args.team_id) {
      throw new Error("Facts do not belong to the specified team");
    }
  }

  // Validate team membership
  const member = await TeamMember.findByTeamAndUser(factTeamId, args.created_by);
  if (!member) {
    throw new Error("You are not a member of this team");
  }

  const relation = await FactRelation.create({
    from_fact: args.from_fact,
    to_fact: args.to_fact,
    type: args.type,
    team_id: factTeamId,
    metadata: args.metadata,
    created_by: args.created_by,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ relation }, null, 2),
      },
    ],
  };
}

