"use client"

import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button";
import { useMutation } from "convex/react";

export default function X() {
  const projects = useQuery(api.projects.get)
  const createProject = useMutation(api.projects.create)

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => createProject({ name: "New Project" })}>
        Add New
      </Button>
      {projects?.map((project) => (
        <div className="border rounded p-2 flex flex-col" key={project._id}>
          <p>{project.name}</p>
          <p>Owner Id: {project.ownerId}</p>
        </div>
      ))}

    </div>
  );
}
