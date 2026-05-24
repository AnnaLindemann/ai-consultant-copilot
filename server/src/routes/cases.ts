import { Router } from "express";
import { prisma } from "../lib/prisma.js"
import { createClientCaseSchema } from "../schemas/client-case.schema.js";
import { analyzeClientCase } from "../services/analysis.service.js";
import { getAnalysisRunsByCaseId } from "../repositories/analysis-run.repository.js"

const router = Router()

router.post("/", async (req,res) => {
  const parseResult = createClientCaseSchema.safeParse(req.body)
  if(!parseResult.success){
return res.status(400).json({status: false, message: "invalid input", errors: parseResult.error.flatten()})
  }

try{
const input = parseResult.data

 const newCase = await prisma.clientCase.create({
  data: {
    companyName: input.companyName,
    industry: input.industry,
    statedProblem: input.statedProblem,
    currentProcess: input.currentProcess,
    sensitiveData: input.sensitiveData,
    gdprConcerns: input.gdprConcerns,
    desiredOutcome: input.desiredOutcome,

    companySize: input.companySize,
    geography: input.geography,
    department: input.department,

    painPoints: input.painPoints,
    affectedUsers: input.affectedUsers,
    businessImpact: input.businessImpact,
    urgency: input.urgency,

    processSteps: input.processSteps,
    processFrequency: input.processFrequency,
    manualWorkLevel: input.manualWorkLevel,
    bottlenecks: input.bottlenecks,

    currentTools: input.currentTools,
    communicationChannels: input.communicationChannels,
    integrationNeeds: input.integrationNeeds,

    dataTypes: input.dataTypes,
    dataLocation: input.dataLocation,
    dataAvailability: input.dataAvailability,
    dataQuality: input.dataQuality,
    sensitiveDataTypes: input.sensitiveDataTypes,

    budgetAmount: input.budgetAmount,
    budgetCurrency: input.budgetCurrency,
    budgetNotes: input.budgetNotes,
    timeline: input.timeline,
    humanApprovalRequired: input.humanApprovalRequired,
    technicalConstraints: input.technicalConstraints,

    successMetrics: input.successMetrics,
    mvpScope: input.mvpScope,
    notes: input.notes,
  },
})
  return res.status(201).json({status: true, message: "Case created", data: newCase})

}catch(error){
    console.error("CREATE CASE ERROR:", error)

  return res.status(500).json({
    status:false,
    message: "Internal server error"
  })
}

})

router.get("/:id/analysis-runs", async (req, res) => {
  try {
    const clientCase = await prisma.clientCase.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    })

    if (!clientCase) {
      return res.status(404).json({
        status: false,
        message: "Case not found",
      })
    }

    const analysisRuns = await getAnalysisRunsByCaseId(req.params.id)

    return res.json({
      status: true,
      data: analysisRuns,
    })
  } catch (error) {
    console.error("GET ANALYSIS RUNS ERROR:", error)

    return res.status(500).json({
      status: false,
      message: "Failed to load analysis runs",
    })
  }
})

router.post("/:id/analyze", async (req, res) => {
  try{
 const clientCase = await prisma.clientCase.findUnique({
  where: { id: req.params.id}
 })

 if(!clientCase){
  return res.status(404).json({status: false, message: "Case not found "})
 }
const result = await analyzeClientCase(clientCase)

if (!result.success) {
  return res.status(422).json({
    status: false,
    message: "LLM output failed validation",
    data: {
      evaluation: result.evaluation,
      error: result.error,
    },
  })
}

return res.status(200).json({
  status: true,
  message: "Analysis completed",
  data: {
    report: result.report,
    evaluation: result.evaluation,
  },
})
  } catch(error){
     console.error("ANALYSIS ERROR:", error)
    return res.status(500).json({status: false, message:"Analysis failed"})
  }
})

export default router