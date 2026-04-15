import React from 'react'

interface VideoCardProps {
  thumbnail: string
  title: string
  videoId: string
  meta?: React.ReactNode
  actions?: React.ReactNode
}

export function VideoCard({ thumbnail, title, videoId, meta, actions }: VideoCardProps) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex gap-3 p-3">
      <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
        <img
          src={thumbnail}
          alt={title}
          className="w-32 h-20 object-cover rounded-lg bg-neutral-800"
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
          }}
        />
      </a>
      <div className="flex flex-col flex-1 min-w-0 gap-1">
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white font-medium text-sm leading-snug line-clamp-2 hover:text-red-400 transition-colors"
        >
          {title}
        </a>
        {meta && <div className="text-neutral-400 text-xs flex items-center gap-2">{meta}</div>}
        {actions && <div className="flex flex-wrap gap-2 mt-auto pt-1">{actions}</div>}
      </div>
    </div>
  )
}
